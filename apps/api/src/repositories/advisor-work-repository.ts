import { pool, type Queryable } from '../db/pool.js';

// งานของผู้ใช้ในฐานะที่ปรึกษาชมรม
// "ชมรมที่ฉันเป็นที่ปรึกษา" = club_advisors ที่ยังไม่สิ้นสุด (ended_on IS NULL) ของชมรม active ที่ไม่ถูกลบ
// (สอดคล้องกับสิทธิ์ชมรม: ชมรมไม่ active เหลือสิทธิ์อ่านอย่างเดียว จึงรับทราบรายงานไม่ได้)

export interface AdvisorSummaryRow {
  pendingConsents: number;
  activeClubs: number;
  reportsToAcknowledge: number;
}

/**
 * ตัวเลขสรุปสำหรับเมนู (เรียกทุกครั้งที่โหลดหน้า จึงเป็น count ล้วน ใช้ index ที่มีอยู่)
 * - คำขอรอยินยอม: ถูกเสนอชื่อ (จับคู่ user_id หรือ email กรณีเสนอก่อนผู้นั้นเคย login) คำขออยู่ในสถานะ awaiting_consent และฉันยังไม่ตอบ
 * - รายงานรอรับทราบ: รายงานประจำเดือนสถานะ submitted ของชมรมที่ฉันเป็นที่ปรึกษา
 */
export async function getAdvisorSummary(userId: string, email: string, db: Queryable = pool): Promise<AdvisorSummaryRow> {
  const result = await db.query<AdvisorSummaryRow>(
    `WITH my_clubs AS (
       SELECT ca.club_id
         FROM club_advisors ca
         JOIN clubs c ON c.id = ca.club_id AND c.deleted_at IS NULL AND c.status = 'active'
        WHERE ca.user_id = $1 AND ca.ended_on IS NULL
     )
     SELECT
       (SELECT count(*)::int
          FROM club_application_advisors adv
          JOIN club_applications a ON a.id = adv.application_id AND a.deleted_at IS NULL
         WHERE (adv.user_id = $1 OR (adv.user_id IS NULL AND adv.email = $2))
           AND adv.consent_status = 'pending' AND a.status = 'awaiting_consent') AS "pendingConsents",
       (SELECT count(*)::int FROM my_clubs) AS "activeClubs",
       (SELECT count(*)::int
          FROM club_monthly_reports r
         WHERE r.status = 'submitted' AND r.club_id IN (SELECT club_id FROM my_clubs)) AS "reportsToAcknowledge"`,
    [userId, email],
  );
  return result.rows[0]!;
}

export interface AdvisedClubRow {
  id: string;
  nameTh: string;
  logoFileId: string | null;
  startedOn: string;
  reportsToAcknowledge: number;
}

// ชมรมที่ฉันเป็นที่ปรึกษาอยู่ พร้อมจำนวนรายงานรอรับทราบของแต่ละชมรม
export async function listAdvisedClubs(userId: string, db: Queryable = pool): Promise<AdvisedClubRow[]> {
  const result = await db.query<AdvisedClubRow>(
    `SELECT c.id, c.name_th AS "nameTh", c.logo_file_id AS "logoFileId",
            to_char(ca.started_on, 'YYYY-MM-DD') AS "startedOn",
            (SELECT count(*)::int FROM club_monthly_reports r
              WHERE r.club_id = c.id AND r.status = 'submitted') AS "reportsToAcknowledge"
       FROM club_advisors ca
       JOIN clubs c ON c.id = ca.club_id AND c.deleted_at IS NULL AND c.status = 'active'
      WHERE ca.user_id = $1 AND ca.ended_on IS NULL
      ORDER BY c.name_th
      LIMIT 50`,
    [userId],
  );
  return result.rows;
}

export interface ReportToAcknowledgeRow {
  id: string;
  clubId: string;
  clubName: string;
  reportMonth: string;
  submittedAt: Date;
  submittedByName: string | null;
}

// รายงานประจำเดือนที่รอฉันรับทราบ (ส่งก่อนแสดงก่อน)
export async function listReportsToAcknowledge(userId: string, db: Queryable = pool): Promise<ReportToAcknowledgeRow[]> {
  const result = await db.query<ReportToAcknowledgeRow>(
    `SELECT r.id, c.id AS "clubId", c.name_th AS "clubName", to_char(r.report_month, 'YYYY-MM-DD') AS "reportMonth",
            r.submitted_at AS "submittedAt", COALESCE(u.name, u.email) AS "submittedByName"
       FROM club_advisors ca
       JOIN clubs c ON c.id = ca.club_id AND c.deleted_at IS NULL AND c.status = 'active'
       JOIN club_monthly_reports r ON r.club_id = c.id AND r.status = 'submitted'
       LEFT JOIN users u ON u.id = r.submitted_by
      WHERE ca.user_id = $1 AND ca.ended_on IS NULL
      ORDER BY r.submitted_at
      LIMIT 100`,
    [userId],
  );
  return result.rows;
}
