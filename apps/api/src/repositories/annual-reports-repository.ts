import { pool, type Queryable } from '../db/pool.js';
import type { MonthlyReportStatus } from './reports-repository.js';

export type AnnualReportStatus = MonthlyReportStatus;

export interface AnnualReportRecord {
  id: string;
  clubId: string;
  fiscalYear: number;
  status: AnnualReportStatus;
}

const RECORD_COLUMNS = 'id, club_id AS "clubId", fiscal_year AS "fiscalYear", status';

// ชน unique (club_id, fiscal_year) ถ้ามีอยู่แล้ว → 23505
export async function insertAnnualReport(clubId: string, fiscalYear: number, createdBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    'INSERT INTO club_annual_reports (club_id, fiscal_year, created_by) VALUES ($1, $2, $3) RETURNING id',
    [clubId, fiscalYear, createdBy],
  );
  return result.rows[0]!.id;
}

export async function findAnnualReportRecord(id: string, db: Queryable = pool): Promise<AnnualReportRecord | null> {
  const result = await db.query<AnnualReportRecord>(`SELECT ${RECORD_COLUMNS} FROM club_annual_reports WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function lockAnnualReport(id: string, db: Queryable): Promise<AnnualReportRecord | null> {
  const result = await db.query<AnnualReportRecord>(`SELECT ${RECORD_COLUMNS} FROM club_annual_reports WHERE id = $1 FOR UPDATE`, [id]);
  return result.rows[0] ?? null;
}

export async function updateAnnualReportText(id: string, summary: string | null, obstacles: string | null, db: Queryable): Promise<void> {
  await db.query('UPDATE club_annual_reports SET summary = $2, obstacles = $3 WHERE id = $1', [id, summary, obstacles]);
}

// ส่งรายงาน: เก็บสถิติและรายการกิจกรรม (คำนวณใน transaction เดียวกัน) เป็นภาพนิ่ง
export async function submitAnnualReport(id: string, submittedBy: string, stats: unknown, activities: unknown, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_annual_reports
        SET status = 'submitted', submitted_by = $2, submitted_at = now(),
            stats_snapshot = $3::jsonb, activities_snapshot = $4::jsonb
      WHERE id = $1`,
    [id, submittedBy, JSON.stringify(stats), JSON.stringify(activities)],
  );
}

export async function acknowledgeAnnualReport(id: string, userId: string, note: string | null, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_annual_reports
        SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now(), acknowledgement_note = $3
      WHERE id = $1`,
    [id, userId, note],
  );
}

export interface AnnualStats {
  activityCount: number;
  participantTotal: number;
  plannedCount: number;
  activeMembers: number;
  approvedAchievements: number;
  monthlyReportsSubmitted: number;
}

/**
 * สถิติของชมรมในปีงบประมาณ [start, end] — scalar subquery แยกต่อหัวข้อ คืน 1 แถว
 * ผู้เข้าร่วมต่อกิจกรรม: นับจากรายชื่อถ้ามี ไม่เช่นนั้นใช้จำนวนที่กรอก (NULLIF 0 → NULL แล้ว COALESCE)
 * สมาชิก active นับ ณ ปัจจุบัน (ไม่มีประวัติรายวัน)
 */
export async function computeAnnualStats(clubId: string, fiscalYear: number, start: string, end: string, db: Queryable = pool): Promise<AnnualStats> {
  const result = await db.query<AnnualStats>(
    `SELECT
       (SELECT count(*)::int FROM club_activities a
         WHERE a.club_id = $1 AND a.deleted_at IS NULL AND a.held_on BETWEEN $3::date AND $4::date) AS "activityCount",
       (SELECT COALESCE(sum(COALESCE(
                 NULLIF((SELECT count(*)::int FROM club_activity_participants ap WHERE ap.activity_id = a.id), 0),
                 a.participant_count, 0)), 0)::int
          FROM club_activities a
         WHERE a.club_id = $1 AND a.deleted_at IS NULL AND a.held_on BETWEEN $3::date AND $4::date) AS "participantTotal",
       (SELECT count(*)::int FROM club_planned_activities p
         WHERE p.club_id = $1 AND p.fiscal_year = $2 AND p.deleted_at IS NULL) AS "plannedCount",
       (SELECT count(*)::int FROM club_memberships m WHERE m.club_id = $1 AND m.status = 'active') AS "activeMembers",
       (SELECT count(*)::int FROM club_achievements ac
         WHERE ac.club_id = $1 AND ac.status = 'approved' AND ac.achieved_on BETWEEN $3::date AND $4::date) AS "approvedAchievements",
       (SELECT count(*)::int FROM club_monthly_reports r
         WHERE r.club_id = $1 AND r.fiscal_year = $2 AND r.status <> 'draft') AS "monthlyReportsSubmitted"`,
    [clubId, fiscalYear, start, end],
  );
  return result.rows[0]!;
}

export interface AnnualReportListRow {
  id: string;
  fiscalYear: number;
  status: AnnualReportStatus;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
}

export async function listAnnualReports(clubId: string, db: Queryable = pool): Promise<AnnualReportListRow[]> {
  const result = await db.query<AnnualReportListRow>(
    `SELECT id, fiscal_year AS "fiscalYear", status, submitted_at AS "submittedAt", acknowledged_at AS "acknowledgedAt"
       FROM club_annual_reports
      WHERE club_id = $1
      ORDER BY fiscal_year DESC
      LIMIT 20`,
    [clubId],
  );
  return result.rows;
}

export interface AnnualReportDetailRow {
  id: string;
  clubId: string;
  clubName: string;
  establishedOn: string;
  fiscalYear: number;
  status: AnnualReportStatus;
  summary: string | null;
  obstacles: string | null;
  statsSnapshot: AnnualStats | null;
  activitiesSnapshot: unknown[] | null;
  createdByName: string | null;
  submittedByName: string | null;
  submittedAt: Date | null;
  acknowledgedByName: string | null;
  acknowledgedAt: Date | null;
  acknowledgementNote: string | null;
}

export async function findAnnualReportDetail(id: string, db: Queryable = pool): Promise<AnnualReportDetailRow | null> {
  const result = await db.query<AnnualReportDetailRow>(
    `SELECT r.id, r.club_id AS "clubId", c.name_th AS "clubName", to_char(c.established_on, 'YYYY-MM-DD') AS "establishedOn",
            r.fiscal_year AS "fiscalYear", r.status, r.summary, r.obstacles,
            r.stats_snapshot AS "statsSnapshot", r.activities_snapshot AS "activitiesSnapshot",
            COALESCE(cu.name, cu.email) AS "createdByName",
            COALESCE(su.name, su.email) AS "submittedByName", r.submitted_at AS "submittedAt",
            COALESCE(au.name, au.email) AS "acknowledgedByName", r.acknowledged_at AS "acknowledgedAt",
            r.acknowledgement_note AS "acknowledgementNote"
       FROM club_annual_reports r
       JOIN clubs c ON c.id = r.club_id
       JOIN users cu ON cu.id = r.created_by
       LEFT JOIN users su ON su.id = r.submitted_by
       LEFT JOIN users au ON au.id = r.acknowledged_by
      WHERE r.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface ReportOverviewRow {
  clubId: string;
  clubName: string;
  // เดือนที่ครบกำหนดแล้ว (สิ้นเดือนผ่านไปแล้ว) แต่ยังไม่ได้ส่งรายงาน 'YYYY-MM'
  missingMonths: string[];
  awaitingAdvisor: number;
  annualReportId: string | null;
  annualStatus: AnnualReportStatus | null;
}

/**
 * ภาพรวมการส่งรายงานของทุกชมรมที่ดำเนินการอยู่ในปีงบประมาณ
 * generate_series สร้างเดือนตั้งแต่ต้นปีงบประมาณถึงเดือนก่อนเดือนปัจจุบัน (เดือนปัจจุบันยังไม่ครบกำหนด)
 * แล้วหาเดือนที่ "ไม่มี" รายงานที่ส่งแล้ว (NOT EXISTS) นับเฉพาะหลังเดือนที่ก่อตั้งชมรม
 */
export async function listReportOverview(fiscalYear: number, start: string, end: string, today: string, db: Queryable = pool): Promise<ReportOverviewRow[]> {
  const result = await db.query<ReportOverviewRow>(
    `WITH months AS (
       SELECT gs::date AS m
         FROM generate_series($2::date, LEAST($3::date, (date_trunc('month', $4::date) - INTERVAL '1 day')::date), INTERVAL '1 month') AS gs
     )
     SELECT c.id AS "clubId", c.name_th AS "clubName",
            ARRAY(
              SELECT to_char(mo.m, 'YYYY-MM') FROM months mo
               WHERE mo.m >= date_trunc('month', c.established_on)::date
                 AND NOT EXISTS (
                   SELECT 1 FROM club_monthly_reports r
                    WHERE r.club_id = c.id AND r.report_month = mo.m AND r.status <> 'draft')
               ORDER BY mo.m
            ) AS "missingMonths",
            (SELECT count(*)::int FROM club_monthly_reports r
              WHERE r.club_id = c.id AND r.fiscal_year = $1 AND r.status = 'submitted') AS "awaitingAdvisor",
            ar.id AS "annualReportId", ar.status AS "annualStatus"
       FROM clubs c
       LEFT JOIN club_annual_reports ar ON ar.club_id = c.id AND ar.fiscal_year = $1
      WHERE c.deleted_at IS NULL AND c.status = 'active'
      ORDER BY c.name_th
      LIMIT 500`,
    [fiscalYear, start, end, today],
  );
  return result.rows;
}
