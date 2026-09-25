import { pool, type Queryable } from '../db/pool.js';

export const ACHIEVEMENT_LEVELS = ['international', 'national', 'regional', 'provincial', 'university', 'club'] as const;
export const ACHIEVEMENT_CATEGORIES = ['competition', 'performance', 'academic', 'community_service', 'other'] as const;
export type AchievementLevel = (typeof ACHIEVEMENT_LEVELS)[number];
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];
export type AchievementStatus = 'pending' | 'approved' | 'returned' | 'rejected' | 'withdrawn';
export type AchievementAction = 'submitted' | 'updated' | 'resubmitted' | 'withdrawn' | 'approved' | 'returned' | 'rejected';

export interface AchievementFields {
  title: string;
  achievedOn: string;
  level: AchievementLevel;
  category: AchievementCategory;
  award: string | null;
  organizer: string | null;
  description: string | null;
}

export interface AchievementRecord {
  id: string;
  clubId: string;
  userId: string;
  status: AchievementStatus;
}

const RECORD_COLUMNS = 'id, club_id AS "clubId", user_id AS "userId", status';

export async function insertAchievement(clubId: string, userId: string, fields: AchievementFields, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, award, organizer, description)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
     RETURNING id`,
    [clubId, userId, fields.title, fields.achievedOn, fields.level, fields.category, fields.award, fields.organizer, fields.description],
  );
  return result.rows[0]!.id;
}

export async function findAchievementRecord(id: string, db: Queryable = pool): Promise<AchievementRecord | null> {
  const result = await db.query<AchievementRecord>(`SELECT ${RECORD_COLUMNS} FROM club_achievements WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

// ล็อกแถวผลงานระหว่างแก้ไข/ตัดสิน (กันเจ้าของแก้ไขพร้อมกับกรรมการรับรอง)
export async function lockAchievement(id: string, db: Queryable): Promise<AchievementRecord | null> {
  const result = await db.query<AchievementRecord>(`SELECT ${RECORD_COLUMNS} FROM club_achievements WHERE id = $1 FOR UPDATE`, [id]);
  return result.rows[0] ?? null;
}

// แก้ข้อมูลผลงาน และตั้งสถานะกลับเป็นรอรับรอง (ใช้ทั้งแก้ขณะรอ และส่งใหม่หลังถูกส่งกลับ)
export async function updateAchievementFields(id: string, fields: AchievementFields, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_achievements
        SET title = $2, achieved_on = $3::date, level = $4, category = $5, award = $6, organizer = $7, description = $8,
            status = 'pending'
      WHERE id = $1`,
    [id, fields.title, fields.achievedOn, fields.level, fields.category, fields.award, fields.organizer, fields.description],
  );
}

export async function setAchievementWithdrawn(id: string, db: Queryable): Promise<void> {
  await db.query(`UPDATE club_achievements SET status = 'withdrawn' WHERE id = $1`, [id]);
}

// ผลการพิจารณา (บันทึกผู้ตัดสิน เวลา และเหตุผลล่าสุด)
export async function decideAchievement(
  id: string,
  status: 'approved' | 'returned' | 'rejected',
  deciderId: string,
  note: string | null,
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE club_achievements SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`,
    [id, status, deciderId, note],
  );
}

export async function insertAchievementEvent(
  input: { achievementId: string; actorUserId: string; action: AchievementAction; note: string | null },
  db: Queryable,
): Promise<void> {
  await db.query(
    'INSERT INTO club_achievement_events (achievement_id, actor_user_id, action, note) VALUES ($1, $2, $3, $4)',
    [input.achievementId, input.actorUserId, input.action, input.note],
  );
}

// ---------- ไฟล์แนบ ----------

export async function listAchievementFileIds(achievementId: string, db: Queryable): Promise<string[]> {
  const result = await db.query<{ fileId: string }>(
    'SELECT file_id AS "fileId" FROM club_achievement_files WHERE achievement_id = $1 ORDER BY sort_order LIMIT 20',
    [achievementId],
  );
  return result.rows.map((row) => row.fileId);
}

/**
 * แทนที่รายการไฟล์แนบทั้งชุด: ลบแถวที่ไม่อยู่ในรายการใหม่ แล้ว upsert ตามลำดับ
 * unnest($2::uuid[]) WITH ORDINALITY แปลง array เป็นแถว (file_id, ลำดับ) ในคำสั่งเดียว
 * ON CONFLICT: ไฟล์ที่แนบอยู่แล้วในผลงานนี้ → อัปเดตลำดับ (service ตรวจก่อนแล้วว่าไม่ได้แนบกับผลงานอื่น)
 */
export async function replaceAchievementFiles(achievementId: string, fileIds: string[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_achievement_files WHERE achievement_id = $1 AND NOT (file_id = ANY($2::uuid[]))', [
    achievementId,
    fileIds,
  ]);
  await db.query(
    `INSERT INTO club_achievement_files (achievement_id, file_id, sort_order)
     SELECT $1, f.file_id, f.ord
       FROM unnest($2::uuid[]) WITH ORDINALITY AS f (file_id, ord)
     ON CONFLICT (file_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
       WHERE club_achievement_files.achievement_id = EXCLUDED.achievement_id`,
    [achievementId, fileIds],
  );
}

// ผลงานที่ไฟล์นี้แนบอยู่ (ใช้ตรวจสิทธิ์อ่านไฟล์) — ใช้ unique index ของ file_id
export async function findAchievementByFileId(fileId: string, db: Queryable = pool): Promise<AchievementRecord | null> {
  const result = await db.query<AchievementRecord>(
    `SELECT a.id, a.club_id AS "clubId", a.user_id AS "userId", a.status
       FROM club_achievement_files af
       JOIN club_achievements a ON a.id = af.achievement_id
      WHERE af.file_id = $1`,
    [fileId],
  );
  return result.rows[0] ?? null;
}

// ---------- อ่านข้อมูลเพื่อแสดงผล ----------

export interface AchievementListRow extends AchievementFields {
  id: string;
  clubId: string;
  clubName: string;
  userId: string;
  ownerName: string | null;
  ownerEmail: string;
  status: AchievementStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LIST_COLUMNS = `
  a.id, a.club_id AS "clubId", c.name_th AS "clubName", a.user_id AS "userId",
  u.name AS "ownerName", u.email AS "ownerEmail",
  a.title, to_char(a.achieved_on, 'YYYY-MM-DD') AS "achievedOn", a.level, a.category,
  a.award, a.organizer, a.description, a.status, a.decision_note AS "decisionNote", a.decided_at AS "decidedAt",
  a.created_at AS "createdAt", a.updated_at AS "updatedAt"`;
const LIST_FROM = `
  FROM club_achievements a
  JOIN clubs c ON c.id = a.club_id
  JOIN users u ON u.id = a.user_id`;

export async function findAchievementDetail(id: string, db: Queryable = pool): Promise<AchievementListRow | null> {
  const result = await db.query<AchievementListRow>(`SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE a.id = $1`, [id]);
  return result.rows[0] ?? null;
}

// ผลงานของฉัน (ทุกสถานะ ทุกชมรม) ใช้ index club_achievements_user_id_idx
export async function listAchievementsOfUser(userId: string, limit: number, offset: number, db: Queryable = pool) {
  const result = await db.query<AchievementListRow & { total: number }>(
    `SELECT ${LIST_COLUMNS}, count(*) OVER ()::int AS total ${LIST_FROM}
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return withTotal(result.rows);
}

// ผลงานที่รับรองแล้วของชมรม (ล่าสุดก่อน) ใช้ partial index club_achievements_club_approved_idx
export async function listApprovedAchievements(clubId: string, limit: number, offset: number, db: Queryable = pool) {
  const result = await db.query<AchievementListRow & { total: number }>(
    `SELECT ${LIST_COLUMNS}, count(*) OVER ()::int AS total ${LIST_FROM}
      WHERE a.club_id = $1 AND a.status = 'approved'
      ORDER BY a.achieved_on DESC, a.created_at DESC
      LIMIT $2 OFFSET $3`,
    [clubId, limit, offset],
  );
  return withTotal(result.rows);
}

// คิวรอรับรองของชมรม (มาก่อนได้ก่อน) ใช้ partial index club_achievements_club_pending_idx
export async function listPendingAchievements(clubId: string, limit: number, db: Queryable = pool): Promise<AchievementListRow[]> {
  const result = await db.query<AchievementListRow>(
    `SELECT ${LIST_COLUMNS} ${LIST_FROM}
      WHERE a.club_id = $1 AND a.status = 'pending'
      ORDER BY a.created_at
      LIMIT $2`,
    [clubId, limit],
  );
  return result.rows;
}

function withTotal(rows: (AchievementListRow & { total: number })[]): { items: AchievementListRow[]; total: number } {
  return { items: rows.map(({ total: _total, ...row }) => row), total: rows[0]?.total ?? 0 };
}

export interface AchievementFileRow {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function listAchievementFiles(achievementId: string, db: Queryable = pool): Promise<AchievementFileRow[]> {
  const result = await db.query<AchievementFileRow>(
    `SELECT f.id AS "fileId", f.original_name AS "originalName", f.mime_type AS "mimeType", f.size_bytes::int AS "sizeBytes"
       FROM club_achievement_files af
       JOIN files f ON f.id = af.file_id
      WHERE af.achievement_id = $1 AND f.deleted_at IS NULL
      ORDER BY af.sort_order
      LIMIT 20`,
    [achievementId],
  );
  return result.rows;
}

export interface AchievementEventRow {
  action: AchievementAction;
  note: string | null;
  actorName: string | null;
  createdAt: Date;
}

export async function listAchievementEvents(achievementId: string, db: Queryable = pool): Promise<AchievementEventRow[]> {
  const result = await db.query<AchievementEventRow>(
    `SELECT e.action, e.note, COALESCE(u.name, u.email) AS "actorName", e.created_at AS "createdAt"
       FROM club_achievement_events e
       JOIN users u ON u.id = e.actor_user_id
      WHERE e.achievement_id = $1
      ORDER BY e.created_at, e.id
      LIMIT 200`,
    [achievementId],
  );
  return result.rows;
}
