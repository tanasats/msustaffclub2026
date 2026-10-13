import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import { isActiveOrgUnit, listActiveOrgUnits } from '../repositories/org-units-repository.js';
import { insertRoleChangeLog } from '../repositories/role-change-logs-repository.js';
import { findRoleByCode } from '../repositories/roles-repository.js';
import {
  findProvisionedProfile,
  findStaffProfileForEdit,
  hasActiveUserWithEmail,
  insertAccountEvent,
  insertProvisionedUser,
  lockStaffProfileTarget,
  updateProvisionedUser,
  updateUserDisplayName,
  upsertProvisionedStaffProfile,
  type ProvisionedProfileInput,
} from '../repositories/user-accounts-repository.js';
import { insertUserRole } from '../repositories/user-roles-repository.js';
import type { AuthContext } from './authorization.js';
import { isAllowedEmailDomain, isEligibleForClub } from './club-rules.js';
import { SYSTEM_ROLES } from './permissions.js';

// เพิ่มบุคลากรล่วงหน้า (ยังไม่เคยเข้าระบบ) — route ตรวจ permission user_account:create แล้ว (ไม่ผูก role → super_admin)
// บัญชีผูกกับบัญชี Google อัตโนมัติเมื่อเจ้าตัว login ครั้งแรกด้วยอีเมลเดียวกัน แล้วข้อมูลจาก ERP จะแทนข้อมูลที่กรอก

export const PROVISION_ROLE_REASON = 'เพิ่มผู้ใช้ล่วงหน้าโดยผู้ดูแลระบบ (บุคลากรที่ยังไม่เคยเข้าระบบ)';

// อีเมลต้องเป็นบัญชีบุคลากร @msu.ac.th (ไม่ใช่นิสิต) เพราะใช้จับคู่ตอน login และเป็นได้แค่บุคลากร
async function validate(input: ProvisionedProfileInput, excludeUserId: string | null, client: DbClient): Promise<void> {
  if (!isAllowedEmailDomain(input.email) || !isEligibleForClub(input.email)) {
    throw new AppError(422, 'EMAIL_NOT_ELIGIBLE', 'อีเมลต้องเป็นบัญชีบุคลากร @msu.ac.th');
  }
  if (await hasActiveUserWithEmail(input.email, excludeUserId, client)) {
    throw new AppError(409, 'USER_EXISTS', 'มีผู้ใช้อีเมลนี้ในระบบแล้ว ค้นหาและเลือกบัญชีเดิมได้เลย');
  }
  if (!(await isActiveOrgUnit(input.orgUnitId, client))) {
    throw new AppError(422, 'ORG_UNIT_NOT_FOUND', 'ไม่พบหน่วยงานที่เลือก');
  }
}

/**
 * เพิ่มบุคลากรล่วงหน้าใน transaction เดียว: บัญชี (ยังไม่ผูก) + ข้อมูลบุคลากรที่กรอก + role user/staff (บันทึก role_change_logs)
 * + ประวัติบัญชี (created)
 */
export async function createProvisionedUser(auth: AuthContext, input: ProvisionedProfileInput): Promise<string> {
  return withTransaction(async (client) => {
    await validate(input, null, client);
    let userId: string;
    try {
      userId = await insertProvisionedUser(input, auth.user.id, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'USER_EXISTS', 'มีผู้ใช้อีเมลนี้ในระบบแล้ว');
      }
      throw err;
    }
    await upsertProvisionedStaffProfile(userId, input, client);
    for (const code of [SYSTEM_ROLES.USER, SYSTEM_ROLES.STAFF]) {
      const role = await findRoleByCode(code, client);
      if (!role) throw new Error(`ไม่พบ role ${code} (ยังไม่ได้รัน migration หรือไม่)`);
      await insertUserRole({ userId, roleId: role.id, grantedBy: auth.user.id }, client);
      await insertRoleChangeLog({ actorUserId: auth.user.id, targetUserId: userId, roleId: role.id, action: 'grant', reason: PROVISION_ROLE_REASON }, client);
    }
    await insertAccountEvent({ userId, actorUserId: auth.user.id, action: 'created', reason: PROVISION_ROLE_REASON, effects: {} }, client);
    return userId;
  });
}

// แก้ข้อมูลบัญชีที่ยังไม่ผูก (บัญชีที่ผูกแล้วใช้ข้อมูลตาม ERP แก้ที่นี่ไม่ได้)
export async function updateProvisionedUserProfile(auth: AuthContext, userId: string, input: ProvisionedProfileInput): Promise<void> {
  await withTransaction(async (client) => {
    await validate(input, userId, client);
    let updated: boolean;
    try {
      updated = await updateProvisionedUser(userId, input, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'USER_EXISTS', 'มีผู้ใช้อีเมลนี้ในระบบแล้ว');
      }
      throw err;
    }
    if (!updated) {
      throw new AppError(409, 'ACCOUNT_LINKED', 'บัญชีนี้เข้าสู่ระบบแล้ว ข้อมูลเป็นไปตาม ERP แก้ไขที่นี่ไม่ได้');
    }
    await upsertProvisionedStaffProfile(userId, input, client);
    await insertAccountEvent({ userId, actorUserId: auth.user.id, action: 'updated', reason: 'แก้ไขข้อมูลบัญชีที่ยังไม่เคยเข้าระบบ', effects: {} }, client);
  });
}

// ข้อมูลที่กรอกของบัญชีที่ยังไม่ผูก (ผูกแล้ว/ไม่ใช่บัญชีที่เพิ่มล่วงหน้า → 404)
export async function getProvisionedProfile(userId: string) {
  const profile = await findProvisionedProfile(userId);
  if (!profile) throw new AppError(404, 'NOT_PROVISIONED', 'บัญชีนี้ไม่ใช่บัญชีที่เพิ่มล่วงหน้า หรือเข้าสู่ระบบแล้ว');
  return profile;
}

export async function getOrgUnitOptions() {
  return { items: await listActiveOrgUnits() };
}

// ---------- บันทึกข้อมูลบุคลากรแทน ERP (บัญชีที่ ERP ไม่มีข้อมูล เช่น ERP ไม่ได้บันทึกอีเมลของบุคลากร) ----------

export type ManualStaffProfileInput = Omit<ProvisionedProfileInput, 'email'>;
export const MANUAL_PROFILE_REASON = 'บันทึกข้อมูลบุคลากรแทน ERP (ERP ไม่มีข้อมูลของบัญชีนี้)';

/**
 * ผู้มีสิทธิ์ user_account:create (ไม่ผูก role → super_admin) บันทึกชื่อ-นามสกุล/หน่วยงานแทน ERP
 * ได้เฉพาะบัญชีบุคลากรที่ยังไม่มีข้อมูลจาก ERP (ไม่มีข้อมูลบุคลากร หรือข้อมูลที่ผู้ดูแลบันทึกไว้เดิม)
 * ชื่อแสดงในระบบเปลี่ยนตาม และคงอยู่แม้ login แล้ว ERP ไม่พบข้อมูล; เมื่อ ERP มีข้อมูล login ครั้งถัดไปจะใช้ข้อมูล ERP แทนอัตโนมัติ
 */
export async function saveManualStaffProfile(auth: AuthContext, userId: string, input: ManualStaffProfileInput): Promise<void> {
  await withTransaction(async (client) => {
    const target = await lockStaffProfileTarget(userId, client);
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
    if (!isEligibleForClub(target.email)) {
      throw new AppError(422, 'NOT_STAFF_ACCOUNT', 'บันทึกข้อมูลบุคลากรได้เฉพาะบัญชีบุคลากร');
    }
    if (target.source === 'erp') {
      throw new AppError(409, 'ERP_PROFILE_EXISTS', 'บัญชีนี้มีข้อมูลจาก ERP แล้ว ข้อมูลเป็นไปตาม ERP แก้ไขที่นี่ไม่ได้');
    }
    if (!(await isActiveOrgUnit(input.orgUnitId, client))) {
      throw new AppError(422, 'ORG_UNIT_NOT_FOUND', 'ไม่พบหน่วยงานที่เลือก');
    }
    await upsertProvisionedStaffProfile(userId, { ...input, email: target.email }, client);
    await updateUserDisplayName(userId, `${input.firstNameTh} ${input.lastNameTh}`, client);
    await insertAccountEvent({ userId, actorUserId: auth.user.id, action: 'updated', reason: MANUAL_PROFILE_REASON, effects: {} }, client);
  });
}

// ข้อมูลบุคลากรปัจจุบันสำหรับฟอร์ม + แก้ได้หรือไม่ (มีข้อมูล ERP แล้ว / ไม่ใช่บัญชีบุคลากร = แก้ไม่ได้)
export async function getManualStaffProfile(userId: string) {
  const profile = await findStaffProfileForEdit(userId);
  if (!profile) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
  return { editable: isEligibleForClub(profile.email) && profile.source !== 'erp', profile };
}
