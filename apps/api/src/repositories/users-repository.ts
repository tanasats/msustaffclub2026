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

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  // หน่วยงานสังกัด (จาก staff_profiles → org_units) ถ้ามี
  orgUnitName: string | null;
}

// LEFT JOIN เพราะผู้ใช้บางคนยังไม่มีข้อมูลบุคลากรหรือยังจับคู่หน่วยงานไม่ได้
const USER_SUMMARY_SELECT = `
  SELECT u.id, u.email, u.name, u.is_active AS "isActive", ou.name_th AS "orgUnitName"
    FROM users u
    LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN org_units ou ON ou.id = sp.org_unit_id`;

// ดึงผู้ใช้หลายคนจาก id (= ANY($1) รับ array ได้ในพารามิเตอร์เดียว) ใช้ PK
export async function findUserSummariesByIds(ids: string[], db: Queryable = pool): Promise<UserSummary[]> {
  if (ids.length === 0) return [];
  const result = await db.query<UserSummary>(`${USER_SUMMARY_SELECT} WHERE u.id = ANY($1::uuid[]) LIMIT 1000`, [ids]);
  return result.rows;
}

/**
 * ค้นผู้ใช้ที่ยังใช้งานได้จากชื่อหรือ email (ใช้เลือกกรรมการ/สมาชิก/ที่ปรึกษา)
 * ILIKE = ไม่สนตัวพิมพ์, escape % และ _ ใน input เพื่อไม่ให้กลายเป็น wildcard
 * จำนวนผู้ใช้ไม่มาก (หลักพัน) จึง scan ได้ ถ้าช้าให้เพิ่ม index pg_trgm
 */
export async function searchActiveUsers(query: string, limit: number, db: Queryable = pool): Promise<UserSummary[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const result = await db.query<UserSummary>(
    `${USER_SUMMARY_SELECT}
      WHERE u.is_active
        AND (u.name ILIKE $1 OR u.email ILIKE $1)
      ORDER BY u.name NULLS LAST, u.email
      LIMIT $2`,
    [pattern, limit],
  );
  return result.rows;
}

// ผู้ใช้ที่ยังใช้งานได้ซึ่งมี email นี้ (อาจมีได้มากกว่า 1 ถ้า email ถูกใช้ซ้ำ จึงคืน array)
export async function findActiveUserIdsByEmail(email: string, db: Queryable = pool): Promise<string[]> {
  const result = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1 AND is_active LIMIT 2', [email]);
  return result.rows.map((row) => row.id);
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  roles: string[];
}

export interface AdminUserPage {
  items: AdminUserListItem[];
  total: number;
}

/**
 * รายชื่อผู้ใช้สำหรับผู้ดูแล (รวมผู้ที่ถูกปิดบัญชี) ค้นจากชื่อ/email ได้ แบ่งหน้าด้วย LIMIT/OFFSET
 * count(*) OVER () = จำนวนทั้งหมดที่ตรงเงื่อนไข (ก่อน LIMIT) ได้มาในคำสั่งเดียว ไม่ต้อง query นับแยก
 * $1 = NULL คือไม่กรอง
 */
export async function listUsersForAdmin(
  query: string | null,
  limit: number,
  offset: number,
  db: Queryable = pool,
): Promise<AdminUserPage> {
  const pattern = query ? `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const result = await db.query<AdminUserListItem & { total: number }>(
    `SELECT u.id, u.email, u.name, u.is_active AS "isActive", u.last_login_at AS "lastLoginAt",
            ARRAY(SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                   WHERE ur.user_id = u.id ORDER BY r.code) AS roles,
            count(*) OVER ()::int AS total
       FROM users u
      WHERE $1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1
      ORDER BY u.name NULLS LAST, u.email
      LIMIT $2 OFFSET $3`,
    [pattern, limit, offset],
  );
  return {
    items: result.rows.map(({ total: _total, ...item }) => item),
    total: result.rows[0]?.total ?? 0,
  };
}

export async function findUserSummaryById(id: string, db: Queryable = pool): Promise<UserSummary | null> {
  const [user] = await findUserSummariesByIds([id], db);
  return user ?? null;
}
