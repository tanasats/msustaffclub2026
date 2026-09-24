import { randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { withTransaction } from '../db/pool.js';
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
import { googleOAuth, type GoogleIdTokenPayload } from './google-oauth-client.js';
import { SYSTEM_ROLES } from './permissions.js';
import { generateToken, hashToken, isWellFormedToken, safeEqual } from './session-token.js';

export const FIRST_LOGIN_REASON = 'ได้รับอัตโนมัติเมื่อเข้าสู่ระบบครั้งแรก';

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
 * จบขั้นตอน login หลัง Google เรียกกลับ: ตรวจ state/nonce/email/โดเมน
 * แล้วบันทึกผู้ใช้ (ใหม่ได้ role user พร้อม log) และสร้าง session ใน transaction เดียว
 */
export async function completeGoogleLogin(input: CompleteLoginInput): Promise<LoginSession> {
  if (!safeEqual(input.state, input.pending.state)) {
    throw new LoginError('login_failed', 'state ไม่ตรงกัน');
  }

  let payload: GoogleIdTokenPayload;
  try {
    payload = await googleOAuth.exchangeCodeForVerifiedIdToken({
      code: input.code,
      codeVerifier: input.pending.codeVerifier,
    });
  } catch (err) {
    throw new LoginError('login_failed', `แลก code หรือตรวจ ID token ไม่ผ่าน: ${(err as Error).message}`);
  }

  if (!payload.nonce || !safeEqual(payload.nonce, input.pending.nonce)) {
    throw new LoginError('login_failed', 'nonce ไม่ตรงกัน');
  }
  const { email } = assertAllowedEmail(payload);

  const token = generateToken();
  return withTransaction(async (client) => {
    const result = await upsertUserOnLogin(
      { googleSub: payload.sub, email, name: payload.name ?? null, pictureUrl: payload.picture ?? null },
      client,
    );
    if (result.status === 'inactive') {
      throw new LoginError('account_disabled', 'บัญชีถูกปิดการใช้งาน');
    }

    if (result.status === 'created') {
      // ผู้ใช้ใหม่ได้ role user เท่านั้น และต้องมี log ใน transaction เดียวกัน
      const userRole = await findRoleByCode(SYSTEM_ROLES.USER, client);
      if (!userRole) {
        throw new Error('ไม่พบ role user (ยังไม่ได้รัน migration หรือไม่)');
      }
      await insertUserRole({ userId: result.userId, roleId: userRole.id, grantedBy: null }, client);
      await insertRoleChangeLog(
        {
          actorUserId: null,
          targetUserId: result.userId,
          roleId: userRole.id,
          action: 'grant',
          reason: FIRST_LOGIN_REASON,
        },
        client,
      );
    }

    await deleteExpiredSessionsForUser(result.userId, client);
    const session = await insertSession(
      { tokenHash: hashToken(token), userId: result.userId, ttlDays: config.session.ttlDays },
      client,
    );
    return { token, expiresAt: session.expiresAt, userId: result.userId };
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
