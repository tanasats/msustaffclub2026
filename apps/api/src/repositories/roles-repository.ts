import { pool, type Queryable } from '../db/pool.js';

export interface RoleRecord {
  id: string;
  code: string;
  nameTh: string;
  isSystem: boolean;
  isPrivileged: boolean;
}

const ROLE_COLUMNS = `
  id,
  code,
  name_th       AS "nameTh",
  is_system     AS "isSystem",
  is_privileged AS "isPrivileged"`;

export async function findRoleByCode(code: string, db: Queryable = pool): Promise<RoleRecord | null> {
  const result = await db.query<RoleRecord>(`SELECT ${ROLE_COLUMNS} FROM roles WHERE code = $1`, [code]);
  return result.rows[0] ?? null;
}

/**
 * ค้น role แล้วล็อกแถวไว้จนจบ transaction (FOR UPDATE)
 * ใช้เมื่อต้อง "ตรวจแล้วค่อยเขียน" เช่น นับจำนวนผู้ถือ role ก่อนให้/ถอน
 * เพื่อไม่ให้ transaction อื่นแทรกเข้ามาระหว่างตรวจกับเขียน ต้องเรียกด้วย client ที่อยู่ใน transaction
 */
export async function lockRoleByCode(code: string, db: Queryable): Promise<RoleRecord | null> {
  const result = await db.query<RoleRecord>(`SELECT ${ROLE_COLUMNS} FROM roles WHERE code = $1 FOR UPDATE`, [code]);
  return result.rows[0] ?? null;
}

export interface RoleWithStats extends RoleRecord {
  description: string | null;
  permissions: string[];
  // จำนวนผู้ใช้ที่ยังใช้งานได้ซึ่งถือ role นี้
  activeHolderCount: number;
}

// รายการ role ทั้งหมดพร้อม permission และจำนวนผู้ถือ (scalar subquery ต่อแถว; role มีไม่กี่สิบแถว)
export async function listRolesWithStats(db: Queryable = pool): Promise<RoleWithStats[]> {
  const result = await db.query<RoleWithStats>(
    `SELECT ${ROLE_COLUMNS}, r.description,
            ARRAY(SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                   WHERE rp.role_id = r.id ORDER BY p.code) AS permissions,
            (SELECT count(*)::int FROM user_roles ur JOIN users u ON u.id = ur.user_id
              WHERE ur.role_id = r.id AND u.is_active) AS "activeHolderCount"
       FROM roles r
      ORDER BY r.is_system DESC, r.is_privileged DESC, r.code
      LIMIT 200`,
  );
  return result.rows;
}
