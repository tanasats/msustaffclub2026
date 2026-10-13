import { pool, type Queryable } from '../db/pool.js';
import type { LoginErpResult } from './my-data-repository.js';

// บันทึกการเข้าระบบสำเร็จ 1 ครั้ง (erpResult null = ไม่ได้เรียก ERP เช่น บัญชีนิสิต)
export async function insertLoginEvent(userId: string, erpResult: LoginErpResult | null, db: Queryable): Promise<void> {
  await db.query('INSERT INTO login_events (user_id, erp_result) VALUES ($1, $2)', [userId, erpResult]);
}

// ลบประวัติที่เก่ากว่า retentionDays วัน (งานตามรอบ)
export async function deleteOldLoginEvents(retentionDays: number, db: Queryable = pool): Promise<number> {
  const result = await db.query('DELETE FROM login_events WHERE created_at < now() - make_interval(days => $1::int)', [retentionDays]);
  return result.rowCount ?? 0;
}
