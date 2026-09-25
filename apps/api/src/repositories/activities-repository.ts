import { pool, type Queryable } from '../db/pool.js';

// ---------- แผนกิจกรรม ----------

export interface PlannedActivityFields {
  plannedDate: string | null;
  plannedTime: string | null;
  title: string;
  note: string | null;
}

export interface PlannedActivityRow extends PlannedActivityFields {
  id: string;
  clubId: string;
  fiscalYear: number;
  // จำนวนกิจกรรมที่จัดจริงตามแผนนี้
  heldCount: number;
}

// แผนของชมรมในปีงบประมาณ เรียงตามวันที่ (ที่ไม่ระบุวันไว้ท้าย) ใช้ partial index club_planned_activities_club_year_idx
export async function listPlannedActivities(clubId: string, fiscalYear: number, db: Queryable = pool): Promise<PlannedActivityRow[]> {
  const result = await db.query<PlannedActivityRow>(
    `SELECT p.id, p.club_id AS "clubId", p.fiscal_year AS "fiscalYear",
            to_char(p.planned_date, 'YYYY-MM-DD') AS "plannedDate", p.planned_time AS "plannedTime", p.title, p.note,
            (SELECT count(*)::int FROM club_activities a WHERE a.planned_activity_id = p.id AND a.deleted_at IS NULL) AS "heldCount"
       FROM club_planned_activities p
      WHERE p.club_id = $1 AND p.fiscal_year = $2 AND p.deleted_at IS NULL
      ORDER BY p.planned_date NULLS LAST, p.sort_order, p.created_at
      LIMIT 200`,
    [clubId, fiscalYear],
  );
  return result.rows;
}

export async function insertPlannedActivity(
  clubId: string,
  fiscalYear: number,
  fields: PlannedActivityFields,
  createdBy: string,
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_planned_activities (club_id, fiscal_year, planned_date, planned_time, title, note, created_by)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7)
     RETURNING id`,
    [clubId, fiscalYear, fields.plannedDate, fields.plannedTime, fields.title, fields.note, createdBy],
  );
  return result.rows[0]!.id;
}

// แก้/ลบ (soft delete) แผนที่เป็นของชมรมนี้เท่านั้น คืน false ถ้าไม่พบ
export async function updatePlannedActivity(id: string, clubId: string, fields: PlannedActivityFields, db: Queryable): Promise<boolean> {
  const result = await db.query(
    `UPDATE club_planned_activities
        SET planned_date = $3::date, planned_time = $4, title = $5, note = $6
      WHERE id = $1 AND club_id = $2 AND deleted_at IS NULL`,
    [id, clubId, fields.plannedDate, fields.plannedTime, fields.title, fields.note],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function softDeletePlannedActivity(id: string, clubId: string, db: Queryable): Promise<boolean> {
  const result = await db.query(
    'UPDATE club_planned_activities SET deleted_at = now() WHERE id = $1 AND club_id = $2 AND deleted_at IS NULL',
    [id, clubId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function plannedActivityBelongsToClub(id: string, clubId: string, db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM club_planned_activities WHERE id = $1 AND club_id = $2 AND deleted_at IS NULL
     ) AS "exists"`,
    [id, clubId],
  );
  return result.rows[0]?.exists ?? false;
}

// ---------- กิจกรรมที่จัดจริง ----------

export interface ActivityFields {
  plannedActivityId: string | null;
  heldOn: string;
  timeText: string | null;
  title: string;
  location: string | null;
  summary: string | null;
  participantCount: number | null;
}

export interface ActivityRecord {
  id: string;
  clubId: string;
}

export async function insertActivity(clubId: string, fields: ActivityFields, recordedBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_activities
       (club_id, planned_activity_id, held_on, time_text, title, location, summary, participant_count, recorded_by)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [clubId, fields.plannedActivityId, fields.heldOn, fields.timeText, fields.title, fields.location, fields.summary, fields.participantCount, recordedBy],
  );
  return result.rows[0]!.id;
}

export async function findActivityRecord(id: string, db: Queryable = pool): Promise<ActivityRecord | null> {
  const result = await db.query<ActivityRecord>(
    'SELECT id, club_id AS "clubId" FROM club_activities WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function lockActivity(id: string, db: Queryable): Promise<ActivityRecord | null> {
  const result = await db.query<ActivityRecord>(
    'SELECT id, club_id AS "clubId" FROM club_activities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateActivity(id: string, fields: ActivityFields, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_activities
        SET planned_activity_id = $2, held_on = $3::date, time_text = $4, title = $5, location = $6, summary = $7,
            participant_count = $8
      WHERE id = $1`,
    [id, fields.plannedActivityId, fields.heldOn, fields.timeText, fields.title, fields.location, fields.summary, fields.participantCount],
  );
}

export async function softDeleteActivity(id: string, db: Queryable): Promise<void> {
  await db.query('UPDATE club_activities SET deleted_at = now() WHERE id = $1', [id]);
}

/**
 * แทนที่รายชื่อผู้เข้าร่วมทั้งชุด: ลบคนที่ไม่อยู่ในรายการใหม่ แล้วเพิ่มคนใหม่ (คนเดิมไม่ถูกแตะ)
 * unnest($2::uuid[]) แปลง array เป็นแถว, ON CONFLICT DO NOTHING ข้ามคนที่มีอยู่แล้ว
 */
export async function replaceParticipants(activityId: string, userIds: string[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_activity_participants WHERE activity_id = $1 AND NOT (user_id = ANY($2::uuid[]))', [
    activityId,
    userIds,
  ]);
  await db.query(
    `INSERT INTO club_activity_participants (activity_id, user_id)
     SELECT $1, u FROM unnest($2::uuid[]) AS u
     ON CONFLICT (activity_id, user_id) DO NOTHING`,
    [activityId, userIds],
  );
}

// ผู้ใช้ในรายการที่ "ไม่ใช่" สมาชิก active ของชมรม (ใช้ตรวจก่อนบันทึกผู้เข้าร่วม)
export async function findNonMembers(clubId: string, userIds: string[], db: Queryable): Promise<string[]> {
  const result = await db.query<{ userId: string }>(
    `SELECT u AS "userId"
       FROM unnest($2::uuid[]) AS u
      WHERE NOT EXISTS (
        SELECT 1 FROM club_memberships m WHERE m.club_id = $1 AND m.user_id = u AND m.status = 'active'
      )`,
    [clubId, userIds],
  );
  return result.rows.map((row) => row.userId);
}

export async function listActivityFileIds(activityId: string, db: Queryable): Promise<string[]> {
  const result = await db.query<{ fileId: string }>(
    'SELECT file_id AS "fileId" FROM club_activity_files WHERE activity_id = $1 ORDER BY sort_order LIMIT 50',
    [activityId],
  );
  return result.rows.map((row) => row.fileId);
}

// แทนที่รูปทั้งชุด (unnest ... WITH ORDINALITY ให้ลำดับตามที่ส่งมา) — service ตรวจแล้วว่าไฟล์ไม่ได้ผูกกับกิจกรรมอื่น
export async function replaceActivityFiles(activityId: string, fileIds: string[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_activity_files WHERE activity_id = $1 AND NOT (file_id = ANY($2::uuid[]))', [activityId, fileIds]);
  await db.query(
    `INSERT INTO club_activity_files (activity_id, file_id, sort_order)
     SELECT $1, f.file_id, f.ord
       FROM unnest($2::uuid[]) WITH ORDINALITY AS f (file_id, ord)
     ON CONFLICT (file_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
       WHERE club_activity_files.activity_id = EXCLUDED.activity_id`,
    [activityId, fileIds],
  );
}

// กิจกรรมที่ไฟล์นี้แนบอยู่ (ใช้ตรวจสิทธิ์อ่านไฟล์และกันแนบซ้ำ)
export async function findActivityByFileId(fileId: string, db: Queryable = pool): Promise<ActivityRecord | null> {
  const result = await db.query<ActivityRecord>(
    `SELECT a.id, a.club_id AS "clubId"
       FROM club_activity_files af
       JOIN club_activities a ON a.id = af.activity_id
      WHERE af.file_id = $1`,
    [fileId],
  );
  return result.rows[0] ?? null;
}

// ---------- อ่านเพื่อแสดงผล ----------

export interface ActivityRow extends ActivityFields {
  id: string;
  clubId: string;
  plannedTitle: string | null;
  // จำนวนที่แสดง: นับจากรายชื่อถ้ามี ไม่เช่นนั้นใช้ตัวเลขที่กรอก
  participantTotal: number | null;
  photoCount: number;
  recordedByName: string | null;
  createdAt: Date;
}

const ACTIVITY_COLUMNS = `
  a.id, a.club_id AS "clubId", a.planned_activity_id AS "plannedActivityId", p.title AS "plannedTitle",
  to_char(a.held_on, 'YYYY-MM-DD') AS "heldOn", a.time_text AS "timeText", a.title, a.location, a.summary,
  a.participant_count AS "participantCount",
  COALESCE(NULLIF((SELECT count(*)::int FROM club_activity_participants ap WHERE ap.activity_id = a.id), 0), a.participant_count)
    AS "participantTotal",
  (SELECT count(*)::int FROM club_activity_files af WHERE af.activity_id = a.id) AS "photoCount",
  COALESCE(u.name, u.email) AS "recordedByName", a.created_at AS "createdAt"`;
const ACTIVITY_FROM = `
  FROM club_activities a
  LEFT JOIN club_planned_activities p ON p.id = a.planned_activity_id
  JOIN users u ON u.id = a.recorded_by`;

// กิจกรรมของชมรมในช่วงวันที่ [from, to] ล่าสุดก่อน ใช้ partial index club_activities_club_held_on_idx
export async function listActivities(clubId: string, from: string, to: string, limit: number, db: Queryable = pool): Promise<ActivityRow[]> {
  const result = await db.query<ActivityRow>(
    `SELECT ${ACTIVITY_COLUMNS} ${ACTIVITY_FROM}
      WHERE a.club_id = $1 AND a.deleted_at IS NULL AND a.held_on BETWEEN $2::date AND $3::date
      ORDER BY a.held_on DESC, a.created_at DESC
      LIMIT $4`,
    [clubId, from, to, limit],
  );
  return result.rows;
}

export async function findActivityDetail(id: string, db: Queryable = pool): Promise<ActivityRow | null> {
  const result = await db.query<ActivityRow>(
    `SELECT ${ACTIVITY_COLUMNS} ${ACTIVITY_FROM} WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface ParticipantRow {
  userId: string;
  name: string | null;
  email: string;
}

export async function listParticipants(activityId: string, db: Queryable = pool): Promise<ParticipantRow[]> {
  const result = await db.query<ParticipantRow>(
    `SELECT u.id AS "userId", u.name, u.email
       FROM club_activity_participants ap
       JOIN users u ON u.id = ap.user_id
      WHERE ap.activity_id = $1
      ORDER BY u.name NULLS LAST, u.email
      LIMIT 1000`,
    [activityId],
  );
  return result.rows;
}

export interface ActivityPhotoRow {
  fileId: string;
  originalName: string;
}

export async function listActivityPhotos(activityId: string, db: Queryable = pool): Promise<ActivityPhotoRow[]> {
  const result = await db.query<ActivityPhotoRow>(
    `SELECT f.id AS "fileId", f.original_name AS "originalName"
       FROM club_activity_files af
       JOIN files f ON f.id = af.file_id
      WHERE af.activity_id = $1 AND f.deleted_at IS NULL
      ORDER BY af.sort_order
      LIMIT 50`,
    [activityId],
  );
  return result.rows;
}
