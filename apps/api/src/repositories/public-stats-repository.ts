import { pool, type Queryable } from '../db/pool.js';

export interface PublicTotalsRow {
  activeClubs: number;
  members: number;
  activities: number;
  achievements: number;
}

export interface PublicCategoryRow {
  code: string;
  nameTh: string;
  clubCount: number;
}

/**
 * ตัวเลขสรุประดับระบบสำหรับหน้า landing (ไม่มีข้อมูลรายบุคคล)
 * - ชมรม active = status 'active' และยังไม่ถูกลบ (นิยามเดียวกับทำเนียบชมรม)
 * - สมาชิก = จำนวนคนไม่ซ้ำ (DISTINCT user_id) ที่เป็นสมาชิก active ของชมรม active — คนที่อยู่หลายชมรมนับครั้งเดียว
 * - กิจกรรม/ผลงานที่รับรอง นับเฉพาะในช่วงปีงบประมาณ [$1, $2] ของชมรมที่ยังไม่ถูกลบ
 * ใช้ scalar subquery 4 ตัวในคำสั่งเดียว (ไป-กลับฐานข้อมูลครั้งเดียว)
 */
export async function getPublicTotals(from: string, to: string, db: Queryable = pool): Promise<PublicTotalsRow> {
  const result = await db.query<PublicTotalsRow>(
    `SELECT
       (SELECT count(*)::int FROM clubs c WHERE c.deleted_at IS NULL AND c.status = 'active') AS "activeClubs",
       (SELECT count(DISTINCT m.user_id)::int
          FROM club_memberships m
          JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL AND c.status = 'active'
         WHERE m.status = 'active') AS "members",
       (SELECT count(*)::int
          FROM club_activities a
          JOIN clubs c ON c.id = a.club_id AND c.deleted_at IS NULL
         WHERE a.deleted_at IS NULL AND a.held_on BETWEEN $1::date AND $2::date) AS "activities",
       (SELECT count(*)::int
          FROM club_achievements ac
          JOIN clubs c ON c.id = ac.club_id AND c.deleted_at IS NULL
         WHERE ac.status = 'approved' AND ac.achieved_on BETWEEN $1::date AND $2::date) AS "achievements"`,
    [from, to],
  );
  return result.rows[0]!;
}

// จำนวนชมรม active แยกตามประเภท — LEFT JOIN เพื่อให้ประเภทที่ยังไม่มีชมรมแสดงเป็น 0
export async function listPublicCategoryCounts(db: Queryable = pool): Promise<PublicCategoryRow[]> {
  const result = await db.query<PublicCategoryRow>(
    `SELECT cc.code, cc.name_th AS "nameTh", count(c.id)::int AS "clubCount"
       FROM club_categories cc
       LEFT JOIN clubs c ON c.category_id = cc.id AND c.deleted_at IS NULL AND c.status = 'active'
      WHERE cc.is_active
      GROUP BY cc.id, cc.code, cc.name_th, cc.sort_order
      ORDER BY cc.sort_order
      LIMIT 50`,
  );
  return result.rows;
}
