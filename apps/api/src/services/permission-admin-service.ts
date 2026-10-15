import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  countActiveRoleHolders,
  countActiveSuperAdmins,
  deletePositionPermission,
  deleteRolePermission,
  findClubPermissionByCode,
  findPermissionByCode,
  insertPermissionChangeLog,
  insertPositionPermission,
  insertRole,
  insertRolePermission,
  listClubPermissionRows,
  listClubPositionsWithPermissions,
  listPermissionChangeLogs,
  listPermissionHolders,
  listPermissionOverview,
  lockClubPositionByCode,
  updateRole,
  userHoldsRole,
  type RoleInput,
} from '../repositories/permission-admin-repository.js';
import { listRolesWithStats, lockRoleByCode, type RoleRecord } from '../repositories/roles-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { ALL_CLUB_PERMISSIONS } from './club-permissions.js';
import { PERMISSIONS, SYSTEM_ROLES, type PermissionCode } from './permissions.js';

/**
 * หน้า "สิทธิ์ในระบบ" — route ตรวจ permission role_permission:manage แล้ว (ไม่ผูก role → super_admin)
 * นักพัฒนาสร้างสิทธิ์ใหม่ (ต้องมีโค้ดรองรับ) ผู้ดูแลกำหนดว่า role/ตำแหน่งใดได้สิทธิ์ใด — มีผลทันทีเพราะระบบอ่านสิทธิ์จาก DB ทุก request
 * ทุกการแก้บันทึก permission_change_logs ใน transaction เดียวกัน (แก้/ลบ log ไม่ได้)
 */

const ALL_SYSTEM_PERMISSIONS: readonly string[] = Object.values(PERMISSIONS);
const HOLDER_LIMIT = 200;
const LOG_PAGE_SIZE = 30;

export async function getPermissionOverview() {
  const [permissions, roles, clubPermissions, clubPositions, superAdminCount] = await Promise.all([
    listPermissionOverview(),
    listRolesWithStats(),
    listClubPermissionRows(),
    listClubPositionsWithPermissions(),
    countActiveSuperAdmins(),
  ]);
  return { permissions, roles, clubPermissions, clubPositions, superAdminCount };
}

export async function getPermissionHolders(code: string) {
  const permission = await findPermissionByCode(code);
  if (!permission) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'ไม่พบสิทธิ์นี้');
  const [holders, superAdminCount] = await Promise.all([listPermissionHolders(permission.id, HOLDER_LIMIT), countActiveSuperAdmins()]);
  return { code, holders, superAdminCount, limit: HOLDER_LIMIT };
}

export async function getPermissionChangeLogs(page: number) {
  return listPermissionChangeLogs(LOG_PAGE_SIZE, (page - 1) * LOG_PAGE_SIZE);
}

// role ที่แก้สิทธิ์ได้: ทุก role ยกเว้น super_admin (ผ่านทุกสิทธิ์ในโค้ดอยู่แล้ว)
async function lockEditableRole(roleCode: string, client: Parameters<typeof lockRoleByCode>[1]): Promise<RoleRecord> {
  const role = await lockRoleByCode(roleCode, client);
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'ไม่พบ role นี้');
  if (role.code === SYSTEM_ROLES.SUPER_ADMIN) {
    throw new AppError(403, 'SUPER_ADMIN_ROLE_FIXED', 'role ผู้ดูแลระบบสูงสุดผ่านทุกสิทธิ์อยู่แล้ว แก้สิทธิ์ไม่ได้');
  }
  return role;
}

/**
 * ผูกสิทธิ์ให้ role — กันยกระดับสิทธิ์ตนเอง: เพิ่มสิทธิ์ให้ role ที่ตนถืออยู่ได้เฉพาะสิทธิ์ที่ตนมีอยู่แล้ว (ตรวจผ่าน hasPermission ที่เดียว)
 * คืนจำนวนผู้ถือ role ที่ได้รับผล
 */
export async function grantRolePermission(auth: AuthContext, roleCode: string, permissionCode: string, reason: string) {
  if (!ALL_SYSTEM_PERMISSIONS.includes(permissionCode)) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'ไม่พบสิทธิ์นี้');
  return withTransaction(async (client) => {
    const role = await lockEditableRole(roleCode, client);
    const permission = await findPermissionByCode(permissionCode, client);
    if (!permission) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'ไม่พบสิทธิ์นี้');
    if ((await userHoldsRole(auth.user.id, role.id, client)) && !hasPermission(auth, permissionCode as PermissionCode)) {
      throw new AppError(403, 'CANNOT_ESCALATE_OWN_ROLE', 'เพิ่มสิทธิ์ที่ตนเองยังไม่มีให้ role ที่ตนเองถืออยู่ไม่ได้');
    }
    if (!(await insertRolePermission(role.id, permission.id, client))) {
      throw new AppError(409, 'ALREADY_BOUND', 'role นี้มีสิทธิ์นี้อยู่แล้ว');
    }
    await insertPermissionChangeLog({ actorUserId: auth.user.id, action: 'role_grant', roleId: role.id, permissionId: permission.id, reason }, client);
    return { affectedUserCount: await countActiveRoleHolders(role.id, client) };
  });
}

export async function revokeRolePermission(auth: AuthContext, roleCode: string, permissionCode: string, reason: string) {
  return withTransaction(async (client) => {
    const role = await lockEditableRole(roleCode, client);
    const permission = await findPermissionByCode(permissionCode, client);
    if (!permission || !(await deleteRolePermission(role.id, permission.id, client))) {
      throw new AppError(404, 'NOT_BOUND', 'role นี้ไม่มีสิทธิ์นี้');
    }
    await insertPermissionChangeLog({ actorUserId: auth.user.id, action: 'role_revoke', roleId: role.id, permissionId: permission.id, reason }, client);
    return { affectedUserCount: await countActiveRoleHolders(role.id, client) };
  });
}

// สิทธิ์ตามตำแหน่งในชมรม — มีผลกับผู้ดำรงตำแหน่งนั้นในทุกชมรม
async function changePositionPermission(auth: AuthContext, positionCode: string, clubPermissionCode: string, reason: string, grant: boolean) {
  if (!(ALL_CLUB_PERMISSIONS as readonly string[]).includes(clubPermissionCode)) {
    throw new AppError(404, 'CLUB_PERMISSION_NOT_FOUND', 'ไม่พบสิทธิ์ชมรมนี้');
  }
  await withTransaction(async (client) => {
    const position = await lockClubPositionByCode(positionCode, client);
    if (!position) throw new AppError(404, 'POSITION_NOT_FOUND', 'ไม่พบตำแหน่งนี้');
    const clubPermission = await findClubPermissionByCode(clubPermissionCode, client);
    if (!clubPermission) throw new AppError(404, 'CLUB_PERMISSION_NOT_FOUND', 'ไม่พบสิทธิ์ชมรมนี้');
    const changed = grant
      ? await insertPositionPermission(position.id, clubPermission.id, client)
      : await deletePositionPermission(position.id, clubPermission.id, client);
    if (!changed) {
      throw grant
        ? new AppError(409, 'ALREADY_BOUND', 'ตำแหน่งนี้มีสิทธิ์นี้อยู่แล้ว')
        : new AppError(404, 'NOT_BOUND', 'ตำแหน่งนี้ไม่มีสิทธิ์นี้');
    }
    await insertPermissionChangeLog(
      {
        actorUserId: auth.user.id,
        action: grant ? 'position_grant' : 'position_revoke',
        clubPositionId: position.id,
        clubPermissionId: clubPermission.id,
        reason,
      },
      client,
    );
  });
}

export const grantPositionPermission = (auth: AuthContext, positionCode: string, clubPermissionCode: string, reason: string) =>
  changePositionPermission(auth, positionCode, clubPermissionCode, reason, true);
export const revokePositionPermission = (auth: AuthContext, positionCode: string, clubPermissionCode: string, reason: string) =>
  changePositionPermission(auth, positionCode, clubPermissionCode, reason, false);

// สร้าง role ใหม่ (ไม่ใช่ role ระบบ) — ให้/ถอนแก่ผู้ใช้ด้วยกฎเดิม (role สิทธิ์สูง → super_admin เท่านั้น)
export async function createRole(auth: AuthContext, code: string, input: RoleInput, reason: string) {
  return withTransaction(async (client) => {
    let roleId: string;
    try {
      roleId = await insertRole(code, input, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new AppError(409, 'ROLE_EXISTS', 'มี role รหัสนี้อยู่แล้ว');
      throw err;
    }
    await insertPermissionChangeLog({ actorUserId: auth.user.id, action: 'role_create', roleId, reason, details: { ...input } }, client);
    return { code };
  });
}

// แก้ชื่อ/คำอธิบาย/สิทธิ์สูง — role ระบบเปลี่ยน "สิทธิ์สูง" ไม่ได้ (กระทบกฎการให้ role ที่ระบบให้อัตโนมัติ)
export async function editRole(auth: AuthContext, roleCode: string, input: RoleInput, reason: string) {
  await withTransaction(async (client) => {
    const role = await lockEditableRole(roleCode, client);
    if (role.isSystem && input.isPrivileged !== role.isPrivileged) {
      throw new AppError(422, 'SYSTEM_ROLE_PRIVILEGE_FIXED', 'role ระบบเปลี่ยนระดับสิทธิ์สูงไม่ได้');
    }
    await updateRole(role.id, input, client);
    await insertPermissionChangeLog(
      { actorUserId: auth.user.id, action: 'role_update', roleId: role.id, reason, details: { before: { nameTh: role.nameTh, isPrivileged: role.isPrivileged }, after: { ...input } } },
      client,
    );
  });
}
