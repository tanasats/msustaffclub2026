import { pool, type Queryable } from '../db/pool.js';

export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface UserPreferences {
  fontScale: FontScale;
  // รับอีเมลแจ้งเตือนจากระบบ (การแจ้งเตือนในระบบแสดงเสมอ)
  emailNotifications: boolean;
}

const PREFERENCE_COLUMNS = 'font_scale AS "fontScale", email_notifications AS "emailNotifications"';

// ไม่มีแถว = ยังไม่เคยตั้งค่า คืน null ให้ service ใช้ค่าเริ่มต้น (ใช้ PK user_id)
export async function findPreferences(userId: string, db: Queryable = pool): Promise<UserPreferences | null> {
  const result = await db.query<UserPreferences>(`SELECT ${PREFERENCE_COLUMNS} FROM user_preferences WHERE user_id = $1`, [userId]);
  return result.rows[0] ?? null;
}

/**
 * สร้างแถวครั้งแรก หรืออัปเดตเฉพาะค่าที่ส่งมา ในคำสั่งเดียว (ON CONFLICT บน PK)
 * ค่าที่ไม่ส่ง (null): แถวใหม่ใช้ค่าเริ่มต้นของคอลัมน์ (COALESCE กับค่าเริ่มต้นเดียวกับ DEFAULT), แถวเดิมคงค่าเดิม
 */
export async function upsertPreferences(
  userId: string,
  changes: { fontScale?: FontScale; emailNotifications?: boolean },
  db: Queryable = pool,
): Promise<UserPreferences> {
  const result = await db.query<UserPreferences>(
    `INSERT INTO user_preferences (user_id, font_scale, email_notifications)
     VALUES ($1, COALESCE($2, 'md'), COALESCE($3, true))
     ON CONFLICT (user_id) DO UPDATE
        SET font_scale = COALESCE($2, user_preferences.font_scale),
            email_notifications = COALESCE($3, user_preferences.email_notifications)
     RETURNING ${PREFERENCE_COLUMNS}`,
    [userId, changes.fontScale ?? null, changes.emailNotifications ?? null],
  );
  return result.rows[0]!;
}

// ผู้ใช้ (จากรายชื่อที่ให้มา) ที่ปิดรับอีเมลแจ้งเตือน — ไม่มีแถว = รับ จึงดึงเฉพาะแถวที่ตั้งเป็น false
export async function findEmailOptOutUserIds(userIds: string[], db: Queryable = pool): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const result = await db.query<{ userId: string }>(
    `SELECT user_id AS "userId" FROM user_preferences WHERE user_id = ANY($1::uuid[]) AND NOT email_notifications`,
    [userIds],
  );
  return new Set(result.rows.map((row) => row.userId));
}
