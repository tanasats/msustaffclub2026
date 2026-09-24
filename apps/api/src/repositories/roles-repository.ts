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
