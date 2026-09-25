import { pool, type Queryable } from '../db/pool.js';

export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface UserPreferences {
  fontScale: FontScale;
}

// ไม่มีแถว = ยังไม่เคยตั้งค่า คืน null ให้ service ใช้ค่าเริ่มต้น (ใช้ PK user_id)
export async function findPreferences(userId: string, db: Queryable = pool): Promise<UserPreferences | null> {
  const result = await db.query<UserPreferences>(
    'SELECT font_scale AS "fontScale" FROM user_preferences WHERE user_id = $1',
    [userId],
  );
  return result.rows[0] ?? null;
}

// สร้างแถวครั้งแรก หรืออัปเดตถ้ามีแล้ว ในคำสั่งเดียว (ON CONFLICT บน PK)
export async function upsertFontScale(userId: string, fontScale: FontScale, db: Queryable = pool): Promise<UserPreferences> {
  const result = await db.query<UserPreferences>(
    `INSERT INTO user_preferences (user_id, font_scale)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET font_scale = EXCLUDED.font_scale
     RETURNING font_scale AS "fontScale"`,
    [userId, fontScale],
  );
  return result.rows[0]!;
}
