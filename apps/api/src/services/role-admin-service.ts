import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { listRoleChangeLogsForUser, insertRoleChangeLog } from '../repositories/role-change-logs-repository.js';
import { listRolesWithStats, lockRoleByCode, type RoleRecord } from '../repositories/roles-repository.js';
import {
  countActiveUsersWithRole,
  deleteUserRole,
  insertUserRole,
  listUserRoleDetails,
} from '../repositories/user-roles-repository.js';
import { findUserSummaryById, listUsersForAdmin } from '../repositories/users-repository.js';
import { hasPermission, isSuperAdmin, type AuthContext } from './authorization.js';
import { PERMISSIONS, SYSTEM_ROLES } from './permissions.js';

/**
 * role ที่ระบบให้อัตโนมัติตอน login (ตามประเภทบัญชี) จัดการด้วยมือไม่ได้
 * เพราะ login ครั้งถัดไประบบจะให้กลับอยู่ดี และ role user ถอนไม่ได้ตามกฎ
 */
const AUTO_ASSIGNED_ROLES: readonly string[] = [SYSTEM_ROLES.USER, SYSTEM_ROLES.STUDENT, SYSTEM_ROLES.STAFF];

export type GrantCheck = { allowed: true } | { allowed: false; code: string; message: string };

/**
 * กฎการให้/ถอน role ทั้งหมดอยู่ที่ฟังก์ชันนี้ที่เดียว (CLAUDE.md หัวข้อ 9)
 * - role ระบบที่ให้อัตโนมัติ (user/student/staff) จัดการด้วยมือไม่ได้
 * - role สิทธิ์สูง (is_privileged รวม super_admin) → super_admin เท่านั้น
 * - role อื่น → ผู้มี user_role:assign
 * กฎที่ขึ้นกับผู้ถูกกระทำ (ห้ามแก้ของตัวเอง, super_admin คนสุดท้าย) ตรวจใน grant/revoke
 */
export function canGrantRole(actor: AuthContext, role: Pick<RoleRecord, 'code' | 'isPrivileged'>): GrantCheck {
  if (AUTO_ASSIGNED_ROLES.includes(role.code)) {
    return { allowed: false, code: 'ROLE_AUTO_ASSIGNED', message: 'role นี้ระบบกำหนดให้อัตโนมัติตามประเภทบัญชี' };
  }
  if (role.isPrivileged) {
    return isSuperAdmin(actor)
      ? { allowed: true }
      : { allowed: false, code: 'SUPER_ADMIN_ONLY', message: 'role สิทธิ์สูงให้/ถอนได้เฉพาะผู้ดูแลระบบสูงสุด' };
  }
  return hasPermission(actor, PERMISSIONS.USER_ROLE_ASSIGN)
    ? { allowed: true }
    : { allowed: false, code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ให้/ถอน role' };
}

function assertAllowed(check: GrantCheck): void {
  if (!check.allowed) {
    const status = check.code === 'ROLE_AUTO_ASSIGNED' ? 422 : 403;
    throw new AppError(status, check.code, check.message);
  }
}

async function loadTarget(targetUserId: string) {
  const target = await findUserSummaryById(targetUserId);
  if (!target) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
  }
  return target;
}

// ---------- อ่าน ----------

export async function listRolesForAdmin(actor: AuthContext) {
  const roles = await listRolesWithStats();
  // บอก UI ว่าผู้ใช้ปัจจุบันให้/ถอน role ไหนได้ (API ยังตรวจซ้ำทุกครั้ง)
  return roles.map((role) => ({ ...role, grantable: canGrantRole(actor, role).allowed }));
}

export async function listUsers(query: string | null, page: number, pageSize: number) {
  const { items, total } = await listUsersForAdmin(query, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export async function getUserRoleOverview(targetUserId: string) {
  const user = await loadTarget(targetUserId);
  const [roles, history] = await Promise.all([
    listUserRoleDetails(targetUserId),
    listRoleChangeLogsForUser(targetUserId, 50),
  ]);
  return { user, roles, history };
}

// ---------- ให้ / ถอน ----------

export async function grantRole(actor: AuthContext, targetUserId: string, roleCode: string, reason: string): Promise<void> {
  if (targetUserId === actor.user.id) {
    throw new AppError(403, 'CANNOT_CHANGE_OWN_ROLES', 'แก้ไข role ของตนเองไม่ได้');
  }
  const target = await loadTarget(targetUserId);
  if (!target.isActive) {
    throw new AppError(422, 'USER_INACTIVE', 'ผู้ใช้นี้ถูกปิดการใช้งาน');
  }

  await withTransaction(async (client) => {
    const role = await lockRoleByCode(roleCode, client);
    if (!role) {
      throw new AppError(404, 'ROLE_NOT_FOUND', 'ไม่พบ role');
    }
    assertAllowed(canGrantRole(actor, role));

    const granted = await insertUserRole({ userId: targetUserId, roleId: role.id, grantedBy: actor.user.id }, client);
    if (!granted) {
      throw new AppError(409, 'ROLE_ALREADY_GRANTED', 'ผู้ใช้มี role นี้อยู่แล้ว');
    }
    await insertRoleChangeLog(
      { actorUserId: actor.user.id, targetUserId, roleId: role.id, action: 'grant', reason },
      client,
    );
  });
}

export async function revokeRole(actor: AuthContext, targetUserId: string, roleCode: string, reason: string): Promise<void> {
  if (targetUserId === actor.user.id) {
    throw new AppError(403, 'CANNOT_CHANGE_OWN_ROLES', 'แก้ไข role ของตนเองไม่ได้');
  }
  await loadTarget(targetUserId);

  await withTransaction(async (client) => {
    // ล็อกแถว role ก่อน เพื่อให้การนับ super_admin ที่เหลือไม่ถูกการถอนพร้อมกันอีกรายการแทรก
    const role = await lockRoleByCode(roleCode, client);
    if (!role) {
      throw new AppError(404, 'ROLE_NOT_FOUND', 'ไม่พบ role');
    }
    assertAllowed(canGrantRole(actor, role));

    const revoked = await deleteUserRole(targetUserId, role.id, client);
    if (!revoked) {
      throw new AppError(409, 'ROLE_NOT_HELD', 'ผู้ใช้ไม่มี role นี้');
    }
    // หลังถอนแล้วต้องเหลือ super_admin ที่ใช้งานได้อย่างน้อย 1 คน ไม่เช่นนั้น rollback ทั้งหมด
    if (role.code === SYSTEM_ROLES.SUPER_ADMIN && (await countActiveUsersWithRole(role.id, client)) === 0) {
      throw new AppError(409, 'LAST_SUPER_ADMIN', 'ถอนผู้ดูแลระบบสูงสุดคนสุดท้ายไม่ได้');
    }
    await insertRoleChangeLog(
      { actorUserId: actor.user.id, targetUserId, roleId: role.id, action: 'revoke', reason },
      client,
    );
  });
}
