import { pool, type Queryable } from '../db/pool.js';

export type MonthlyReportStatus = 'draft' | 'submitted' | 'acknowledged';

export interface MonthlyReportRecord {
  id: string;
  clubId: string;
  reportMonth: string;
  status: MonthlyReportStatus;
}

const RECORD_COLUMNS = `id, club_id AS "clubId", to_char(report_month, 'YYYY-MM-DD') AS "reportMonth", status`;

// สร้างร่างรายงานของเดือน (ชนกับ unique (club_id, report_month) ถ้ามีอยู่แล้ว → 23505)
export async function insertMonthlyReport(
  clubId: string,
  reportMonth: string,
  fiscalYear: number,
  createdBy: string,
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_monthly_reports (club_id, report_month, fiscal_year, created_by)
     VALUES ($1, $2::date, $3, $4)
     RETURNING id`,
    [clubId, reportMonth, fiscalYear, createdBy],
  );
  return result.rows[0]!.id;
}

export async function findMonthlyReportRecord(id: string, db: Queryable = pool): Promise<MonthlyReportRecord | null> {
  const result = await db.query<MonthlyReportRecord>(`SELECT ${RECORD_COLUMNS} FROM club_monthly_reports WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function lockMonthlyReport(id: string, db: Queryable): Promise<MonthlyReportRecord | null> {
  const result = await db.query<MonthlyReportRecord>(`SELECT ${RECORD_COLUMNS} FROM club_monthly_reports WHERE id = $1 FOR UPDATE`, [id]);
  return result.rows[0] ?? null;
}

export async function updateMonthlyReportSummary(id: string, summary: string | null, db: Queryable): Promise<void> {
  await db.query('UPDATE club_monthly_reports SET summary = $2 WHERE id = $1', [id, summary]);
}

export interface MeetingInput {
  metOn: string;
  agenda: string;
  resolution: string | null;
  attendeeCount: number | null;
}

/**
 * แทนที่บันทึกการประชุมทั้งชุดของรายงาน (ร่างเท่านั้น)
 * unnest หลาย array พร้อมกัน + WITH ORDINALITY → 1 แถวต่อการประชุม ตามลำดับที่ส่งมา ในคำสั่งเดียว
 */
export async function replaceMeetings(reportId: string, meetings: MeetingInput[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_report_meetings WHERE report_id = $1', [reportId]);
  if (meetings.length === 0) return;
  await db.query(
    `INSERT INTO club_report_meetings (report_id, met_on, agenda, resolution, attendee_count, sort_order)
     SELECT $1, m.met_on, m.agenda, m.resolution, m.attendee_count, m.ord
       FROM unnest($2::date[], $3::text[], $4::text[], $5::int[]) WITH ORDINALITY
            AS m (met_on, agenda, resolution, attendee_count, ord)`,
    [
      reportId,
      meetings.map((m) => m.metOn),
      meetings.map((m) => m.agenda),
      meetings.map((m) => m.resolution),
      meetings.map((m) => m.attendeeCount),
    ],
  );
}

/**
 * ส่งรายงาน: เปลี่ยนสถานะ + เก็บภาพนิ่งของกิจกรรมในเดือนนั้นเป็น jsonb ในคำสั่งเดียว
 * jsonb_agg(... ORDER BY held_on) รวมกิจกรรมเป็น array; ไม่มีกิจกรรม → COALESCE เป็น []
 * ช่วงเดือน: held_on >= วันที่ 1 และ < วันที่ 1 ของเดือนถัดไป (ใช้ index club_activities_club_held_on_idx)
 */
export async function submitMonthlyReport(id: string, submittedBy: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_monthly_reports r
        SET status = 'submitted', submitted_by = $2, submitted_at = now(),
            activities_snapshot = COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'id', a.id,
                       'heldOn', to_char(a.held_on, 'YYYY-MM-DD'),
                       'title', a.title,
                       'location', a.location,
                       'summary', a.summary,
                       'participantTotal', COALESCE(
                         NULLIF((SELECT count(*)::int FROM club_activity_participants ap WHERE ap.activity_id = a.id), 0),
                         a.participant_count)
                     ) ORDER BY a.held_on, a.created_at)
                FROM club_activities a
               WHERE a.club_id = r.club_id AND a.deleted_at IS NULL
                 AND a.held_on >= r.report_month AND a.held_on < (r.report_month + INTERVAL '1 month')
            ), '[]'::jsonb)
      WHERE r.id = $1`,
    [id, submittedBy],
  );
}

export async function acknowledgeMonthlyReport(id: string, userId: string, note: string | null, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_monthly_reports
        SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now(), acknowledgement_note = $3
      WHERE id = $1`,
    [id, userId, note],
  );
}

// ---------- อ่านเพื่อแสดงผล ----------

export interface MonthlyReportSummaryRow {
  id: string;
  reportMonth: string;
  status: MonthlyReportStatus;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
}

// รายงานของชมรมในปีงบประมาณ (ใช้ index club_monthly_reports_club_year_idx)
export async function listMonthlyReports(clubId: string, fiscalYear: number, db: Queryable = pool): Promise<MonthlyReportSummaryRow[]> {
  const result = await db.query<MonthlyReportSummaryRow>(
    `SELECT id, to_char(report_month, 'YYYY-MM-DD') AS "reportMonth", status,
            submitted_at AS "submittedAt", acknowledged_at AS "acknowledgedAt"
       FROM club_monthly_reports
      WHERE club_id = $1 AND fiscal_year = $2
      ORDER BY report_month
      LIMIT 12`,
    [clubId, fiscalYear],
  );
  return result.rows;
}

export interface SnapshotActivity {
  id: string;
  heldOn: string;
  title: string;
  location: string | null;
  summary: string | null;
  participantTotal: number | null;
}

export interface MonthlyReportDetailRow {
  id: string;
  clubId: string;
  clubName: string;
  reportMonth: string;
  fiscalYear: number;
  status: MonthlyReportStatus;
  summary: string | null;
  activitiesSnapshot: SnapshotActivity[] | null;
  createdByName: string | null;
  submittedByName: string | null;
  submittedAt: Date | null;
  acknowledgedByName: string | null;
  acknowledgedAt: Date | null;
  acknowledgementNote: string | null;
}

export async function findMonthlyReportDetail(id: string, db: Queryable = pool): Promise<MonthlyReportDetailRow | null> {
  const result = await db.query<MonthlyReportDetailRow>(
    `SELECT r.id, r.club_id AS "clubId", c.name_th AS "clubName", to_char(r.report_month, 'YYYY-MM-DD') AS "reportMonth",
            r.fiscal_year AS "fiscalYear", r.status, r.summary, r.activities_snapshot AS "activitiesSnapshot",
            COALESCE(cu.name, cu.email) AS "createdByName",
            COALESCE(su.name, su.email) AS "submittedByName", r.submitted_at AS "submittedAt",
            COALESCE(au.name, au.email) AS "acknowledgedByName", r.acknowledged_at AS "acknowledgedAt",
            r.acknowledgement_note AS "acknowledgementNote"
       FROM club_monthly_reports r
       JOIN clubs c ON c.id = r.club_id
       JOIN users cu ON cu.id = r.created_by
       LEFT JOIN users su ON su.id = r.submitted_by
       LEFT JOIN users au ON au.id = r.acknowledged_by
      WHERE r.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface MeetingRow extends MeetingInput {
  id: string;
}

export async function listMeetings(reportId: string, db: Queryable = pool): Promise<MeetingRow[]> {
  const result = await db.query<MeetingRow>(
    `SELECT id, to_char(met_on, 'YYYY-MM-DD') AS "metOn", agenda, resolution, attendee_count AS "attendeeCount"
       FROM club_report_meetings
      WHERE report_id = $1
      ORDER BY sort_order
      LIMIT 100`,
    [reportId],
  );
  return result.rows;
}
