import { pool, type Queryable } from '../db/pool.js';

/**
 * ภาพรวมและการแก้การผูกสิทธิ์ (หน้า "สิทธิ์ในระบบ" ของผู้ดูแล) — role/สิทธิ์มีไม่กี่สิบแถว จึงใช้ subquery ต่อแถวได้
 * ผู้ถือสิทธิ์ = ผู้ใช้ที่ยังใช้งานอยู่ซึ่งถือ role ที่ผูกกับสิทธิ์นั้น (super_admin ผ่านทุกสิทธิ์ในโค้ด จึงนับแยก)
 */

export interface PermissionOverview {
  code: string;
  descriptionTh: string;
  roles: { code: string; nameTh: string; isPrivileged: boolean }[];
  holderCount: number;
}

export async function listPermissionOverview(db: Queryable = pool): Promise<PermissionOverview[]> {
  const result = await db.query<PermissionOverview>(
    `SELECT p.code, p.description_th AS "descriptionTh",
            COALESCE((SELECT json_agg(json_build_object('code', r.code, 'nameTh', r.name_th, 'isPrivileged', r.is_privileged) ORDER BY r.code)
                        FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.permission_id = p.id), '[]'::json) AS roles,
            (SELECT count(DISTINCT ur.user_id)::int
               FROM role_permissions rp JOIN user_roles ur ON ur.role_id = rp.role_id JOIN users u ON u.id = ur.user_id
              WHERE rp.permission_id = p.id AND u.is_active) AS "holderCount"
       FROM permissions p
      ORDER BY p.code
      LIMIT 200`,
  );
  return result.rows;
}

export interface ClubPermissionRow {
  code: string;
  descriptionTh: string;
}

export async function listClubPermissionRows(db: Queryable = pool): Promise<ClubPermissionRow[]> {
  const result = await db.query<ClubPermissionRow>(
    'SELECT code, description_th AS "descriptionTh" FROM club_permissions ORDER BY code LIMIT 200',
  );
  return result.rows;
}

export interface ClubPositionWithPermissions {
  code: string;
  nameTh: string;
  kind: string;
  permissions: string[];
}

export async function listClubPositionsWithPermissions(db: Queryable = pool): Promise<ClubPositionWithPermissions[]> {
  const result = await db.query<ClubPositionWithPermissions>(
    `SELECT p.code, p.name_th AS "nameTh", p.kind,
            ARRAY(SELECT cp.code FROM club_position_permissions cpp JOIN club_permissions cp ON cp.id = cpp.club_permission_id
                   WHERE cpp.position_id = p.id ORDER BY cp.code) AS permissions
       FROM club_positions p
      ORDER BY p.sort_order, p.code
      LIMIT 200`,
  );
  return result.rows;
}

export interface PermissionHolder {
  id: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  // role ที่ให้สิทธิ์นี้แก่ผู้ใช้
  roles: string[];
}

// ผู้ถือสิทธิ์ผ่าน role (ผู้ใช้ที่ยังใช้งานอยู่) เรียงตามชื่อ
export async function listPermissionHolders(permissionId: string, limit: number, db: Queryable = pool): Promise<PermissionHolder[]> {
  const result = await db.query<PermissionHolder>(
    `SELECT u.id, u.name, u.email, ou.name_th AS "orgUnitName", array_agg(DISTINCT r.name_th ORDER BY r.name_th) AS roles
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       JOIN users u ON u.id = ur.user_id AND u.is_active
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE rp.permission_id = $1
      GROUP BY u.id, u.name, u.email, ou.name_th
      ORDER BY u.name NULLS LAST, u.email
      LIMIT $2`,
    [permissionId, limit],
  );
  return result.rows;
}

export async function countActiveSuperAdmins(db: Queryable = pool): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
      WHERE r.code = 'super_admin' AND u.is_active`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function findPermissionByCode(code: string, db: Queryable = pool): Promise<{ id: string; code: string } | null> {
  const result = await db.query<{ id: string; code: string }>('SELECT id, code FROM permissions WHERE code = $1', [code]);
  return result.rows[0] ?? null;
}

export async function findClubPermissionByCode(code: string, db: Queryable = pool): Promise<{ id: string; code: string } | null> {
  const result = await db.query<{ id: string; code: string }>('SELECT id, code FROM club_permissions WHERE code = $1', [code]);
  return result.rows[0] ?? null;
}

// ล็อกแถวตำแหน่งจนจบ transaction (กันแก้สิทธิ์ของตำแหน่งเดียวกันซ้อนกัน)
export async function lockClubPositionByCode(code: string, db: Queryable): Promise<{ id: string; code: string; nameTh: string } | null> {
  const result = await db.query<{ id: string; code: string; nameTh: string }>(
    'SELECT id, code, name_th AS "nameTh" FROM club_positions WHERE code = $1 FOR UPDATE',
    [code],
  );
  return result.rows[0] ?? null;
}

// ผูก/ถอน คืน false ถ้าผูกอยู่แล้ว/ไม่ได้ผูก
export async function insertRolePermission(roleId: string, permissionId: string, db: Queryable): Promise<boolean> {
  const result = await db.query(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING',
    [roleId, permissionId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteRolePermission(roleId: string, permissionId: string, db: Queryable): Promise<boolean> {
  const result = await db.query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [roleId, permissionId]);
  return (result.rowCount ?? 0) > 0;
}

export async function insertPositionPermission(positionId: string, clubPermissionId: string, db: Queryable): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO club_position_permissions (position_id, club_permission_id) VALUES ($1, $2)
     ON CONFLICT (position_id, club_permission_id) DO NOTHING`,
    [positionId, clubPermissionId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deletePositionPermission(positionId: string, clubPermissionId: string, db: Queryable): Promise<boolean> {
  const result = await db.query('DELETE FROM club_position_permissions WHERE position_id = $1 AND club_permission_id = $2', [
    positionId,
    clubPermissionId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

// ผู้ใช้ถือ role นี้อยู่หรือไม่ / จำนวนผู้ถือที่ยังใช้งานอยู่ (แสดงผลกระทบ)
export async function userHoldsRole(userId: string, roleId: string, db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2) AS "exists"',
    [userId, roleId],
  );
  return result.rows[0]?.exists ?? false;
}

export async function countActiveRoleHolders(roleId: string, db: Queryable): Promise<number> {
  const result = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE ur.role_id = $1 AND u.is_active',
    [roleId],
  );
  return result.rows[0]?.count ?? 0;
}

export interface RoleInput {
  nameTh: string;
  description: string | null;
  isPrivileged: boolean;
}

// role ที่ผู้ดูแลสร้างไม่ใช่ role ระบบ (is_system = false) — code ซ้ำชน UNIQUE (23505)
export async function insertRole(code: string, input: RoleInput, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO roles (code, name_th, description, is_system, is_privileged) VALUES ($1, $2, $3, false, $4) RETURNING id`,
    [code, input.nameTh, input.description, input.isPrivileged],
  );
  return result.rows[0]!.id;
}

export async function updateRole(roleId: string, input: RoleInput, db: Queryable): Promise<void> {
  await db.query('UPDATE roles SET name_th = $2, description = $3, is_privileged = $4 WHERE id = $1', [
    roleId,
    input.nameTh,
    input.description,
    input.isPrivileged,
  ]);
}

export interface NewPermissionChangeLog {
  actorUserId: string;
  action: 'role_grant' | 'role_revoke' | 'position_grant' | 'position_revoke' | 'role_create' | 'role_update';
  roleId?: string | null;
  permissionId?: string | null;
  clubPositionId?: string | null;
  clubPermissionId?: string | null;
  reason: string;
  details?: Record<string, unknown>;
}

export async function insertPermissionChangeLog(input: NewPermissionChangeLog, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO permission_change_logs (actor_user_id, action, role_id, permission_id, club_position_id, club_permission_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.actorUserId,
      input.action,
      input.roleId ?? null,
      input.permissionId ?? null,
      input.clubPositionId ?? null,
      input.clubPermissionId ?? null,
      input.reason,
      JSON.stringify(input.details ?? {}),
    ],
  );
}

export interface PermissionChangeLogItem {
  id: string;
  action: string;
  actorName: string | null;
  roleCode: string | null;
  roleNameTh: string | null;
  permissionCode: string | null;
  positionNameTh: string | null;
  clubPermissionCode: string | null;
  reason: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export async function listPermissionChangeLogs(
  limit: number,
  offset: number,
  db: Queryable = pool,
): Promise<{ items: PermissionChangeLogItem[]; total: number }> {
  const [items, total] = await Promise.all([
    db.query<PermissionChangeLogItem>(
      `SELECT l.id, l.action, a.name AS "actorName", r.code AS "roleCode", r.name_th AS "roleNameTh",
              p.code AS "permissionCode", cp.name_th AS "positionNameTh", cpm.code AS "clubPermissionCode",
              l.reason, l.details, l.created_at AS "createdAt"
         FROM permission_change_logs l
         JOIN users a ON a.id = l.actor_user_id
         LEFT JOIN roles r ON r.id = l.role_id
         LEFT JOIN permissions p ON p.id = l.permission_id
         LEFT JOIN club_positions cp ON cp.id = l.club_position_id
         LEFT JOIN club_permissions cpm ON cpm.id = l.club_permission_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    db.query<{ count: number }>('SELECT count(*)::int AS count FROM permission_change_logs'),
  ]);
  return { items: items.rows, total: total.rows[0]?.count ?? 0 };
}
