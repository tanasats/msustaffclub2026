import { pool, type Queryable } from '../db/pool.js';

// รับทราบเวอร์ชันนี้แล้วหรือยัง และเคยรับทราบเวอร์ชันอื่นมาก่อนหรือไม่ (ใช้บอกว่าประกาศ "มีการปรับปรุง")
export async function getAcknowledgementState(
  userId: string,
  version: string,
  db: Queryable = pool,
): Promise<{ acknowledged: boolean; acknowledgedEarlier: boolean }> {
  const result = await db.query<{ acknowledged: boolean; acknowledgedEarlier: boolean }>(
    `SELECT coalesce(bool_or(notice_version = $2), false) AS acknowledged,
            coalesce(bool_or(notice_version <> $2), false) AS "acknowledgedEarlier"
       FROM privacy_notice_acknowledgements WHERE user_id = $1`,
    [userId, version],
  );
  return result.rows[0]!;
}

// บันทึกการรับทราบ (กดซ้ำ = ไม่เพิ่มแถว เพราะ UNIQUE (user_id, notice_version))
export async function insertAcknowledgement(userId: string, version: string, db: Queryable = pool): Promise<void> {
  await db.query(
    `INSERT INTO privacy_notice_acknowledgements (user_id, notice_version) VALUES ($1, $2)
     ON CONFLICT (user_id, notice_version) DO NOTHING`,
    [userId, version],
  );
}
