import { randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { withTransaction, type DbClient } from '../db/pool.js';
import { logger } from '../logger.js';
import { findStudentFacultyByCode } from '../repositories/org-units-repository.js';
import { upsertStaffProfile, upsertStudentProfile } from '../repositories/profiles-repository.js';
import { findRoleByCode } from '../repositories/roles-repository.js';
import { insertRoleChangeLog } from '../repositories/role-change-logs-repository.js';
import {
  deleteExpiredSessionsForUser,
  deleteSessionByTokenHash,
  findActiveSessionWithUser,
  insertSession,
  touchSession,
} from '../repositories/sessions-repository.js';
import { insertUserRole } from '../repositories/user-roles-repository.js';
import { upsertUserOnLogin } from '../repositories/users-repository.js';
import type { AuthContext } from './authorization.js';
import { classifyAccount } from './account-type.js';
import { erpHr, type ErpStaffInfo } from './erp-hr-client.js';
import { resolveStaffOrgUnit } from './erp-org-unit-service.js';
import { googleOAuth, type GoogleIdTokenPayload, type VerifiedGoogleLogin } from './google-oauth-client.js';
import { SYSTEM_ROLES } from './permissions.js';
import { generateToken, hashToken, isWellFormedToken, safeEqual } from './session-token.js';

export const FIRST_LOGIN_REASON = 'ได้รับอัตโนมัติเมื่อเข้าสู่ระบบครั้งแรก';
export const ACCOUNT_TYPE_ROLE_REASON = 'ได้รับอัตโนมัติตามประเภทบัญชี (นิสิต/บุคลากร)';

// รหัสเหตุผลที่ login ไม่สำเร็จ (ส่งต่อให้หน้า web แสดงข้อความ)
export type LoginFailureCode = 'login_failed' | 'email_not_verified' | 'domain_not_allowed' | 'account_disabled';

export class LoginError extends Error {
  constructor(
    public readonly code: LoginFailureCode,
    // เหตุผลภายในสำหรับ log เท่านั้น ไม่ส่งถึงผู้ใช้
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'LoginError';
  }
}

// ค่าที่ต้องจำไว้ระหว่างส่งผู้ใช้ไป Google จนกลับมาที่ callback (เก็บใน cookie อายุสั้น)
export interface PendingOAuth {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function startGoogleLogin(): Promise<{ authorizationUrl: string; pending: PendingOAuth }> {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const { codeVerifier, codeChallenge } = await googleOAuth.createPkcePair();
  const authorizationUrl = googleOAuth.buildAuthorizationUrl({ state, nonce, codeChallenge });
  return { authorizationUrl, pending: { state, nonce, codeVerifier } };
}

function assertAllowedEmail(payload: GoogleIdTokenPayload): { email: string } {
  if (payload.email_verified !== true || !payload.email) {
    throw new LoginError('email_not_verified', 'email ยังไม่ได้ยืนยันกับ Google');
  }
  const email = payload.email.toLowerCase();

  const allowed = config.google.allowedEmailDomains;
  if (allowed.length > 0) {
    const domain = email.slice(email.lastIndexOf('@') + 1);
    // ตรวจทั้งโดเมนของ email และ claim hd (บัญชี Google Workspace ของโดเมนนั้นจริง)
    const hd = payload.hd?.toLowerCase();
    if (!allowed.includes(domain) || !hd || !allowed.includes(hd)) {
      throw new LoginError('domain_not_allowed', 'โดเมนของบัญชีไม่อยู่ในรายการที่อนุญาต');
    }
  }
  return { email };
}

export interface CompleteLoginInput {
  code: string;
  state: string;
  pending: PendingOAuth;
}

export interface LoginSession {
  token: string;
  expiresAt: Date;
  userId: string;
}

/**
 * ให้ role แก่ผู้ใช้ถ้ายังไม่มี และเขียน log เฉพาะเมื่อให้จริง (รันซ้ำได้)
 * ต้องเรียกใน transaction เดียวกับงานอื่นของการ login
 */
async function ensureSystemRole(userId: string, roleCode: string, reason: string, client: DbClient): Promise<void> {
  const role = await findRoleByCode(roleCode, client);
  if (!role) {
    throw new Error(`ไม่พบ role ${roleCode} (ยังไม่ได้รัน migration หรือไม่)`);
  }
  const granted = await insertUserRole({ userId, roleId: role.id, grantedBy: null }, client);
  if (granted) {
    await insertRoleChangeLog(
      { actorUserId: null, targetUserId: userId, roleId: role.id, action: 'grant', reason },
      client,
    );
  }
}

/**
 * ดึงข้อมูลบุคลากรจาก ERP-HR โดยไม่ทำให้ login ล้ม
 * ถ้าเรียกไม่สำเร็จหรือไม่พบข้อมูล คืน null (ข้อมูลเดิมในฐานข้อมูลยังอยู่ และจะดึงใหม่ใน login ครั้งถัดไป)
 */
async function fetchStaffInfoSafely(accessToken: string): Promise<ErpStaffInfo | null> {
  try {
    const info = await erpHr.fetchStaffInfo(accessToken);
    if (!info) {
      logger.warn('ERP-HR: ไม่พบข้อมูลบุคลากรของบัญชีนี้');
    }
    return info;
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, 'ERP-HR: ดึงข้อมูลบุคลากรไม่สำเร็จ');
    return null;
  }
}

/**
 * จบขั้นตอน login หลัง Google เรียกกลับ: ตรวจ state/nonce/email/โดเมน
 * แล้วใน transaction เดียว: บันทึกผู้ใช้, ให้ role user + student/staff (พร้อม log), บันทึกโปรไฟล์ และสร้าง session
 */
export async function completeGoogleLogin(input: CompleteLoginInput): Promise<LoginSession> {
  if (!safeEqual(input.state, input.pending.state)) {
    throw new LoginError('login_failed', 'state ไม่ตรงกัน');
  }

  let verified: VerifiedGoogleLogin;
  try {
    verified = await googleOAuth.exchangeCodeForVerifiedIdToken({
      code: input.code,
      codeVerifier: input.pending.codeVerifier,
    });
  } catch (err) {
    throw new LoginError('login_failed', `แลก code หรือตรวจ ID token ไม่ผ่าน: ${(err as Error).message}`);
  }
  const { payload, accessToken } = verified;

  if (!payload.nonce || !safeEqual(payload.nonce, input.pending.nonce)) {
    throw new LoginError('login_failed', 'nonce ไม่ตรงกัน');
  }
  const { email } = assertAllowedEmail(payload);
  const account = classifyAccount(email);

  // เรียก ERP นอก transaction เพื่อไม่ถือ connection ฐานข้อมูลค้างไว้ระหว่างรอเครือข่าย
  const staffInfo = account.type === 'staff' ? await fetchStaffInfoSafely(accessToken) : null;

  const token = generateToken();
  return withTransaction(async (client) => {
    const result = await upsertUserOnLogin(
      { googleSub: payload.sub, email, name: payload.name ?? null, pictureUrl: payload.picture ?? null },
      client,
    );
    if (result.status === 'inactive') {
      throw new LoginError('account_disabled', 'บัญชีถูกปิดการใช้งาน');
    }
    const userId = result.userId;

    // ตรวจทุกครั้งที่ login: ผู้ใช้ใหม่ได้ role ครบ ผู้ใช้เดิมที่ยังไม่มี role ประเภทบัญชีก็ได้เพิ่ม
    await ensureSystemRole(userId, SYSTEM_ROLES.USER, FIRST_LOGIN_REASON, client);

    if (account.type === 'student') {
      await ensureSystemRole(userId, SYSTEM_ROLES.STUDENT, ACCOUNT_TYPE_ROLE_REASON, client);
      // รหัสคณะที่ไม่อยู่ในตาราง → เก็บคณะเป็น NULL แต่ยัง login ได้
      const faculty = await findStudentFacultyByCode(account.facultyCode, client);
      await upsertStudentProfile({ userId, studentCode: account.studentCode, orgUnitId: faculty?.id ?? null }, client);
    } else {
      await ensureSystemRole(userId, SYSTEM_ROLES.STAFF, ACCOUNT_TYPE_ROLE_REASON, client);
      if (staffInfo) {
        const orgUnitId = await resolveStaffOrgUnit(staffInfo, client);
        await upsertStaffProfile(userId, staffInfo, orgUnitId, client);
      }
    }

    await deleteExpiredSessionsForUser(userId, client);
    const session = await insertSession(
      { tokenHash: hashToken(token), userId, ttlDays: config.session.ttlDays },
      client,
    );
    return { token, expiresAt: session.expiresAt, userId };
  });
}

/**
 * แปลง token ใน cookie เป็นข้อมูลผู้ใช้ปัจจุบัน (อ่านจากฐานข้อมูลใหม่ทุกครั้ง)
 * คืน null ถ้า token ผิดรูปแบบ, ไม่มีในระบบ, หมดอายุ หรือผู้ใช้ถูกปิดใช้งาน
 */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  if (!isWellFormedToken(token)) {
    return null;
  }
  const row = await findActiveSessionWithUser(hashToken(token));
  if (!row) {
    return null;
  }
  await touchSession(row.sessionId);
  return {
    sessionId: row.sessionId,
    user: { id: row.userId, email: row.email, name: row.name, pictureUrl: row.pictureUrl },
    roles: row.roles,
    permissions: row.permissions,
  };
}

export async function logout(token: string): Promise<void> {
  if (!isWellFormedToken(token)) {
    return;
  }
  await deleteSessionByTokenHash(hashToken(token));
}
