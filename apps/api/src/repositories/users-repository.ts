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

export interface LoginProfile {
  googleSub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

export type UpsertLoginResult =
  | { status: 'created'; userId: string }
  | { status: 'updated'; userId: string }
  | { status: 'inactive'; userId: string };

/**
 * บันทึกผู้ใช้ตอน login ด้วยคำสั่งเดียว (ปลอดภัยเมื่อ login พร้อมกันหลายแท็บ)
 * - ยังไม่มี google_sub นี้ → INSERT ผู้ใช้ใหม่
 * - มีแล้วและ is_active → UPDATE ข้อมูลโปรไฟล์ล่าสุดจาก Google + last_login_at
 * - มีแล้วแต่ถูกปิดใช้งาน → WHERE users.is_active ทำให้ไม่ UPDATE และไม่คืนแถว
 * (xmax = 0) เป็นเทคนิคของ PostgreSQL บอกว่าแถวที่คืนมาเกิดจาก INSERT (true) หรือ UPDATE (false)
 */
export async function upsertUserOnLogin(profile: LoginProfile, db: Queryable = pool): Promise<UpsertLoginResult> {
  const upserted = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO users (google_sub, email, name, picture_url, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (google_sub) DO UPDATE
        SET email         = EXCLUDED.email,
            name          = EXCLUDED.name,
            picture_url   = EXCLUDED.picture_url,
            last_login_at = now()
      WHERE users.is_active
     RETURNING id, (xmax = 0) AS inserted`,
    [profile.googleSub, profile.email, profile.name, profile.pictureUrl],
  );
  const row = upserted.rows[0];
  if (row) {
    return { status: row.inserted ? 'created' : 'updated', userId: row.id };
  }

  // ไม่มีแถวคืนมา = มีผู้ใช้อยู่แล้วแต่ถูกปิดใช้งาน
  const inactive = await db.query<{ id: string }>('SELECT id FROM users WHERE google_sub = $1', [profile.googleSub]);
  const inactiveRow = inactive.rows[0];
  if (!inactiveRow) {
    throw new Error('upsertUserOnLogin: ไม่พบผู้ใช้หลัง ON CONFLICT');
  }
  return { status: 'inactive', userId: inactiveRow.id };
}
