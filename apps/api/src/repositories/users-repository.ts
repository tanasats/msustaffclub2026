import { pool, type Queryable } from '../db/pool.js';

export interface UserRecord {
  id: string;
  googleSub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ตั้ง alias เป็น camelCase ใน SQL เลย จะได้คืนค่าเป็น UserRecord ได้ตรง ๆ
const USER_COLUMNS = `
  id,
  google_sub    AS "googleSub",
  email,
  name,
  picture_url   AS "pictureUrl",
  is_active     AS "isActive",
  last_login_at AS "lastLoginAt",
  created_at    AS "createdAt",
  updated_at    AS "updatedAt"`;

/**
 * ค้นผู้ใช้จาก email (ต้องส่ง email ตัวพิมพ์เล็กมา เพราะในตารางเก็บตัวพิมพ์เล็กเสมอ)
 * คืนเป็น array เพราะ email ไม่ UNIQUE (email เดิมอาจถูกบัญชี Google ใหม่นำไปใช้)
 * ใช้ index users_email_idx
 */
export async function findUsersByEmail(email: string, db: Queryable = pool): Promise<UserRecord[]> {
  const result = await db.query<UserRecord>(
    `SELECT ${USER_COLUMNS}
       FROM users
      WHERE email = $1
      ORDER BY created_at
      LIMIT 10`,
    [email],
  );
  return result.rows;
}
