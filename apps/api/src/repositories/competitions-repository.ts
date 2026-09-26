import { pool, type Queryable } from '../db/pool.js';

// ---------- ค่าสถิติของชนิดกีฬา ----------

export interface StatDefinitionRow {
  id: string;
  sportId: string;
  code: string;
  nameTh: string;
  unit: string | null;
  better: 'higher' | 'lower';
  isActive: boolean;
}

const STAT_COLUMNS = `id, sport_id AS "sportId", code, name_th AS "nameTh", unit, better, is_active AS "isActive"`;

export async function listStatDefinitions(sportId: string, includeInactive: boolean, db: Queryable = pool): Promise<StatDefinitionRow[]> {
  const result = await db.query<StatDefinitionRow>(
    `SELECT ${STAT_COLUMNS} FROM sport_stat_definitions
      WHERE sport_id = $1 AND ($2 OR is_active)
      ORDER BY sort_order, name_th
      LIMIT 100`,
    [sportId, includeInactive],
  );
  return result.rows;
}

// ชน unique (sport_id, code) → 23505
export async function insertStatDefinition(
  sportId: string,
  input: { code: string; nameTh: string; unit: string | null; better: 'higher' | 'lower' },
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO sport_stat_definitions (sport_id, code, name_th, unit, better, sort_order)
     VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(max(sort_order), 0) + 1 FROM sport_stat_definitions WHERE sport_id = $1))
     RETURNING id`,
    [sportId, input.code, input.nameTh, input.unit, input.better],
  );
  return result.rows[0]!.id;
}

export async function updateStatDefinition(
  id: string,
  input: { nameTh: string; unit: string | null; better: 'higher' | 'lower'; isActive: boolean },
  db: Queryable,
): Promise<boolean> {
  const result = await db.query(
    'UPDATE sport_stat_definitions SET name_th = $2, unit = $3, better = $4, is_active = $5 WHERE id = $1',
    [id, input.nameTh, input.unit, input.better, input.isActive],
  );
  return (result.rowCount ?? 0) > 0;
}

// ค่าสถิติที่ใช้งานอยู่ของชนิดกีฬานี้ จากรายการ id ที่ส่งมา (ใช้ตรวจความถูกต้อง)
export async function findActiveStatIdsOfSport(sportId: string, statIds: string[], db: Queryable): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    'SELECT id FROM sport_stat_definitions WHERE sport_id = $1 AND id = ANY($2::uuid[]) AND is_active',
    [sportId, statIds],
  );
  return result.rows.map((row) => row.id);
}

// ---------- การแข่งขัน ----------

export interface CompetitionFields {
  sportId: string;
  title: string;
  eventName: string | null;
  level: string;
  format: 'individual' | 'team';
  heldFrom: string;
  heldTo: string | null;
  location: string | null;
  organizer: string | null;
  note: string | null;
}

export interface ResultInput {
  userId: string;
  rank: number | null;
  medal: 'gold' | 'silver' | 'bronze' | null;
  note: string | null;
  stats: { statId: string; value: number }[];
}

export async function insertCompetition(clubId: string, fields: CompetitionFields, recordedBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO sport_competitions
       (club_id, sport_id, title, event_name, level, format, held_from, held_to, location, organizer, note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12)
     RETURNING id`,
    [clubId, fields.sportId, fields.title, fields.eventName, fields.level, fields.format, fields.heldFrom, fields.heldTo, fields.location, fields.organizer, fields.note, recordedBy],
  );
  return result.rows[0]!.id;
}

export async function updateCompetition(id: string, fields: CompetitionFields, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE sport_competitions
        SET sport_id = $2, title = $3, event_name = $4, level = $5, format = $6, held_from = $7::date, held_to = $8::date,
            location = $9, organizer = $10, note = $11
      WHERE id = $1`,
    [id, fields.sportId, fields.title, fields.eventName, fields.level, fields.format, fields.heldFrom, fields.heldTo, fields.location, fields.organizer, fields.note],
  );
}

export async function lockCompetition(id: string, db: Queryable): Promise<{ id: string; clubId: string } | null> {
  const result = await db.query<{ id: string; clubId: string }>(
    'SELECT id, club_id AS "clubId" FROM sport_competitions WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function softDeleteCompetition(id: string, db: Queryable): Promise<void> {
  await db.query('UPDATE sport_competitions SET deleted_at = now() WHERE id = $1', [id]);
}

// นักกีฬาในรายการที่ "ไม่ใช่" นักกีฬาปัจจุบันของชนิดกีฬานี้ในชมรม
export async function findNonAthletes(clubId: string, sportId: string, userIds: string[], db: Queryable): Promise<string[]> {
  const result = await db.query<{ userId: string }>(
    `SELECT u AS "userId" FROM unnest($3::uuid[]) AS u
      WHERE NOT EXISTS (
        SELECT 1 FROM club_athletes a
         WHERE a.club_id = $1 AND a.sport_id = $2 AND a.user_id = u AND a.ended_at IS NULL)`,
    [clubId, sportId, userIds],
  );
  return result.rows.map((row) => row.userId);
}

/**
 * แทนที่ผลทั้งชุด: ลบผลเดิม (ค่าสถิติถูกลบตามด้วย ON DELETE CASCADE) แล้วเพิ่มใหม่
 * ค่าสถิติทั้งหมด INSERT ในคำสั่งเดียวด้วย unnest ของ 3 array (ผู้ใช้, ค่าสถิติ, ค่า) แล้ว JOIN หา result_id
 */
export async function replaceResults(competitionId: string, results: ResultInput[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM sport_competition_results WHERE competition_id = $1', [competitionId]);
  if (results.length === 0) return;
  await db.query(
    `INSERT INTO sport_competition_results (competition_id, user_id, rank, medal, note)
     SELECT $1, r.user_id, r.rank, r.medal, r.note
       FROM unnest($2::uuid[], $3::int[], $4::text[], $5::text[]) AS r (user_id, rank, medal, note)`,
    [competitionId, results.map((r) => r.userId), results.map((r) => r.rank), results.map((r) => r.medal), results.map((r) => r.note)],
  );
  const stats = results.flatMap((r) => r.stats.map((s) => ({ userId: r.userId, ...s })));
  if (stats.length === 0) return;
  await db.query(
    `INSERT INTO sport_result_stats (result_id, stat_definition_id, value)
     SELECT res.id, s.stat_id, s.value
       FROM unnest($2::uuid[], $3::uuid[], $4::numeric[]) AS s (user_id, stat_id, value)
       JOIN sport_competition_results res ON res.competition_id = $1 AND res.user_id = s.user_id`,
    [competitionId, stats.map((s) => s.userId), stats.map((s) => s.statId), stats.map((s) => s.value)],
  );
}

export interface CompetitionRow extends CompetitionFields {
  id: string;
  clubId: string;
  clubName: string;
  sportName: string;
  participantCount: number;
  gold: number;
  silver: number;
  bronze: number;
  recordedByName: string | null;
}

const COMPETITION_COLUMNS = `
  c.id, c.club_id AS "clubId", cl.name_th AS "clubName", c.sport_id AS "sportId", s.name_th AS "sportName",
  c.title, c.event_name AS "eventName", c.level, c.format,
  to_char(c.held_from, 'YYYY-MM-DD') AS "heldFrom", to_char(c.held_to, 'YYYY-MM-DD') AS "heldTo",
  c.location, c.organizer, c.note,
  (SELECT count(*)::int FROM sport_competition_results r WHERE r.competition_id = c.id) AS "participantCount",
  (SELECT count(*)::int FROM sport_competition_results r WHERE r.competition_id = c.id AND r.medal = 'gold') AS gold,
  (SELECT count(*)::int FROM sport_competition_results r WHERE r.competition_id = c.id AND r.medal = 'silver') AS silver,
  (SELECT count(*)::int FROM sport_competition_results r WHERE r.competition_id = c.id AND r.medal = 'bronze') AS bronze,
  COALESCE(u.name, u.email) AS "recordedByName"`;
const COMPETITION_FROM = `
  FROM sport_competitions c
  JOIN clubs cl ON cl.id = c.club_id
  JOIN sports s ON s.id = c.sport_id
  JOIN users u ON u.id = c.recorded_by`;

// การแข่งขันของชมรมในช่วงวันที่ (ล่าสุดก่อน) ใช้ partial index sport_competitions_club_held_idx
export async function listCompetitions(clubId: string, from: string, to: string, db: Queryable = pool): Promise<CompetitionRow[]> {
  const result = await db.query<CompetitionRow>(
    `SELECT ${COMPETITION_COLUMNS} ${COMPETITION_FROM}
      WHERE c.club_id = $1 AND c.deleted_at IS NULL AND c.held_from BETWEEN $2::date AND $3::date
      ORDER BY c.held_from DESC, c.created_at DESC
      LIMIT 300`,
    [clubId, from, to],
  );
  return result.rows;
}

export async function findCompetition(id: string, db: Queryable = pool): Promise<CompetitionRow | null> {
  const result = await db.query<CompetitionRow>(`SELECT ${COMPETITION_COLUMNS} ${COMPETITION_FROM} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  return result.rows[0] ?? null;
}

export interface ResultRow {
  userId: string;
  name: string | null;
  email: string;
  rank: number | null;
  medal: 'gold' | 'silver' | 'bronze' | null;
  note: string | null;
  // ค่าสถิติ (json array) — service ตัดออกถ้าผู้ดูไม่มีสิทธิ์
  stats: { statId: string; nameTh: string; unit: string | null; value: number }[];
}

/**
 * ผลของการแข่งขัน เรียงอันดับ (ไม่มีอันดับไว้ท้าย)
 * ค่าสถิติรวมเป็น json array ต่อแถวด้วย subquery + json_agg (COALESCE เป็น [] ถ้าไม่มี)
 */
export async function listResults(competitionId: string, db: Queryable = pool): Promise<ResultRow[]> {
  const result = await db.query<ResultRow>(
    `SELECT r.user_id AS "userId", u.name, u.email, r.rank, r.medal, r.note,
            COALESCE((
              SELECT json_agg(json_build_object('statId', d.id, 'nameTh', d.name_th, 'unit', d.unit, 'value', rs.value::float8)
                              ORDER BY d.sort_order)
                FROM sport_result_stats rs
                JOIN sport_stat_definitions d ON d.id = rs.stat_definition_id
               WHERE rs.result_id = r.id
            ), '[]'::json) AS stats
       FROM sport_competition_results r
       JOIN users u ON u.id = r.user_id
      WHERE r.competition_id = $1
      ORDER BY r.rank NULLS LAST, u.name NULLS LAST
      LIMIT 500`,
    [competitionId],
  );
  return result.rows;
}

// ---------- สรุปนักกีฬา ----------

export interface AthleteSummaryRow {
  competitionCount: number;
  gold: number;
  silver: number;
  bronze: number;
  bestRank: number | null;
  activityCount: number;
}

/**
 * สรุปของนักกีฬาในชมรม: จำนวนแข่ง เหรียญ อันดับดีที่สุด และจำนวนกิจกรรมที่เข้าร่วม (การเข้าซ้อม)
 * count(*) FILTER (WHERE ...) นับแยกเงื่อนไขในการสแกนครั้งเดียว
 */
export async function findAthleteSummary(clubId: string, userId: string, db: Queryable = pool): Promise<AthleteSummaryRow> {
  const result = await db.query<AthleteSummaryRow>(
    `SELECT count(r.id)::int AS "competitionCount",
            count(*) FILTER (WHERE r.medal = 'gold')::int AS gold,
            count(*) FILTER (WHERE r.medal = 'silver')::int AS silver,
            count(*) FILTER (WHERE r.medal = 'bronze')::int AS bronze,
            min(r.rank) AS "bestRank",
            (SELECT count(*)::int FROM club_activity_participants ap
               JOIN club_activities a ON a.id = ap.activity_id
              WHERE a.club_id = $1 AND a.deleted_at IS NULL AND ap.user_id = $2) AS "activityCount"
       FROM sport_competition_results r
       JOIN sport_competitions c ON c.id = r.competition_id AND c.club_id = $1 AND c.deleted_at IS NULL
      WHERE r.user_id = $2`,
    [clubId, userId],
  );
  return result.rows[0]!;
}

export interface BestStatRow {
  statId: string;
  sportName: string;
  nameTh: string;
  unit: string | null;
  better: 'higher' | 'lower';
  best: number;
  timesRecorded: number;
}

/**
 * สถิติดีที่สุดต่อค่าสถิติ: ค่ามากดีกว่า → max, ค่าน้อยดีกว่า → min (CASE เลือกตาม better ของแต่ละค่าสถิติ)
 */
export async function listBestStats(clubId: string, userId: string, db: Queryable = pool): Promise<BestStatRow[]> {
  const result = await db.query<BestStatRow>(
    `SELECT d.id AS "statId", s.name_th AS "sportName", d.name_th AS "nameTh", d.unit, d.better,
            (CASE WHEN d.better = 'higher' THEN max(rs.value) ELSE min(rs.value) END)::float8 AS best,
            count(*)::int AS "timesRecorded"
       FROM sport_result_stats rs
       JOIN sport_competition_results r ON r.id = rs.result_id AND r.user_id = $2
       JOIN sport_competitions c ON c.id = r.competition_id AND c.club_id = $1 AND c.deleted_at IS NULL
       JOIN sport_stat_definitions d ON d.id = rs.stat_definition_id
       JOIN sports s ON s.id = d.sport_id
      GROUP BY d.id, s.name_th, s.sort_order, d.name_th, d.unit, d.better, d.sort_order
      ORDER BY s.sort_order, d.sort_order
      LIMIT 100`,
    [clubId, userId],
  );
  return result.rows;
}

export interface AthleteCompetitionRow {
  competitionId: string;
  title: string;
  eventName: string | null;
  sportName: string;
  level: string;
  heldFrom: string;
  organizer: string | null;
  rank: number | null;
  medal: 'gold' | 'silver' | 'bronze' | null;
}

// ประวัติการแข่งขันของนักกีฬาในชมรม (ล่าสุดก่อน)
export async function listAthleteCompetitions(clubId: string, userId: string, db: Queryable = pool): Promise<AthleteCompetitionRow[]> {
  const result = await db.query<AthleteCompetitionRow>(
    `SELECT c.id AS "competitionId", c.title, c.event_name AS "eventName", s.name_th AS "sportName", c.level,
            to_char(c.held_from, 'YYYY-MM-DD') AS "heldFrom", c.organizer, r.rank, r.medal
       FROM sport_competition_results r
       JOIN sport_competitions c ON c.id = r.competition_id AND c.club_id = $1 AND c.deleted_at IS NULL
       JOIN sports s ON s.id = c.sport_id
      WHERE r.user_id = $2
      ORDER BY c.held_from DESC
      LIMIT 200`,
    [clubId, userId],
  );
  return result.rows;
}
