import { pool, type Queryable } from '../db/pool.js';

export async function userHasRole(userId: string, roleId: string, db: Queryable = pool): Promise<boolean> {
  // EXISTS หยุดทันทีเมื่อเจอแถวแรก และใช้ PK (user_id, role_id) ได้ตรง ๆ
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2) AS "exists"',
    [userId, roleId],
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * นับผู้ใช้ที่ยังใช้งานได้ (is_active) ที่ถือ role นี้
 * ใช้ index user_roles_role_id_idx แล้ว JOIN users ด้วย PK
 */
export async function countActiveUsersWithRole(roleId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS "count"
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
      WHERE ur.role_id = $1
        AND u.is_active`,
    [roleId],
  );
  return result.rows[0]?.count ?? 0;
}

export interface NewUserRole {
  userId: string;
  roleId: string;
  // null = ระบบเป็นผู้ให้
  grantedBy: string | null;
}

/**
 * ให้ role แก่ผู้ใช้ คืน true ถ้าเพิ่มใหม่, false ถ้ามีอยู่แล้ว
 * ON CONFLICT DO NOTHING ทำให้ไม่ error เมื่อถือ role อยู่แล้ว และ RETURNING บอกได้ว่าเพิ่มจริงหรือไม่
 */
export async function insertUserRole(input: NewUserRole, db: Queryable = pool): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO user_roles (user_id, role_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, role_id) DO NOTHING
     RETURNING user_id`,
    [input.userId, input.roleId, input.grantedBy],
  );
  return result.rowCount === 1;
}
