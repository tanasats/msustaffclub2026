import { pool, type Queryable } from '../db/pool.js';

// ค่าตั้งค่าตาม key ที่ขอ (key ที่ยังไม่มีแถว = ไม่อยู่ในผลลัพธ์ ให้ service ใช้ค่าเริ่มต้น)
export async function getSettingValues(keys: readonly string[], db: Queryable = pool): Promise<Map<string, unknown>> {
  const result = await db.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM system_settings WHERE key = ANY($1::text[])',
    [keys],
  );
  return new Map(result.rows.map((row) => [row.key, row.value]));
}

// บันทึกค่า (มีอยู่แล้ว = แทนที่) พร้อมผู้แก้ไข
export async function upsertSetting(key: string, value: unknown, updatedBy: string, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), updatedBy],
  );
}

export async function getSettingMeta(key: string, db: Queryable = pool): Promise<{ updatedAt: Date; updatedByName: string | null } | null> {
  const result = await db.query<{ updatedAt: Date; updatedByName: string | null }>(
    `SELECT s.updated_at AS "updatedAt", COALESCE(u.name, u.email) AS "updatedByName"
       FROM system_settings s LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.key = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}
