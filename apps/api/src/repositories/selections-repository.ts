import { pool, type Queryable } from '../db/pool.js';

export type SelectionKind = 'representative' | 'award';
export type SelectionDecision = 'selected' | 'reserve' | 'not_selected';

export interface RoundInput {
  kind: SelectionKind;
  title: string;
  sportId: string | null;
  eventName: string | null;
  fiscalYear: number;
  criteria: string | null;
  slots: number | null;
}

export interface RoundRow extends RoundInput {
  id: string;
  sportName: string | null;
  status: 'open' | 'closed';
  createdByName: string | null;
  closedAt: Date | null;
  decidedCount: number;
  selectedCount: number;
  createdAt: Date;
}

const ROUND_COLUMNS = `
  r.id, r.kind, r.title, r.sport_id AS "sportId", s.name_th AS "sportName", r.event_name AS "eventName",
  r.fiscal_year AS "fiscalYear", r.criteria, r.slots, r.status, COALESCE(u.name, u.email) AS "createdByName",
  r.closed_at AS "closedAt", r.created_at AS "createdAt",
  (SELECT count(*)::int FROM selection_candidates c WHERE c.round_id = r.id) AS "decidedCount",
  (SELECT count(*)::int FROM selection_candidates c WHERE c.round_id = r.id AND c.decision = 'selected') AS "selectedCount"`;
const ROUND_FROM = `
  FROM selection_rounds r
  LEFT JOIN sports s ON s.id = r.sport_id
  JOIN users u ON u.id = r.created_by`;

export async function insertRound(input: RoundInput, createdBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO selection_rounds (kind, title, sport_id, event_name, fiscal_year, criteria, slots, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [input.kind, input.title, input.sportId, input.eventName, input.fiscalYear, input.criteria, input.slots, createdBy],
  );
  return result.rows[0]!.id;
}

export async function listRounds(db: Queryable = pool): Promise<RoundRow[]> {
  const result = await db.query<RoundRow>(`SELECT ${ROUND_COLUMNS} ${ROUND_FROM} ORDER BY r.fiscal_year DESC, r.created_at DESC LIMIT 200`);
  return result.rows;
}

// รอบที่ปิดแล้ว (ประกาศผลแล้ว) ล่าสุดก่อน
export async function listClosedRounds(db: Queryable = pool): Promise<RoundRow[]> {
  const result = await db.query<RoundRow>(
    `SELECT ${ROUND_COLUMNS} ${ROUND_FROM} WHERE r.status = 'closed' ORDER BY r.closed_at DESC LIMIT 100`,
  );
  return result.rows;
}

export async function findRound(id: string, db: Queryable = pool): Promise<RoundRow | null> {
  const result = await db.query<RoundRow>(`SELECT ${ROUND_COLUMNS} ${ROUND_FROM} WHERE r.id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function lockRound(id: string, db: Queryable): Promise<{ id: string; status: 'open' | 'closed'; sportId: string | null; fiscalYear: number } | null> {
  const result = await db.query<{ id: string; status: 'open' | 'closed'; sportId: string | null; fiscalYear: number }>(
    'SELECT id, status, sport_id AS "sportId", fiscal_year AS "fiscalYear" FROM selection_rounds WHERE id = $1 FOR UPDATE',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function closeRound(id: string, closedBy: string, db: Queryable): Promise<void> {
  await db.query(`UPDATE selection_rounds SET status = 'closed', closed_by = $2, closed_at = now() WHERE id = $1`, [id, closedBy]);
}

// บันทึก/เปลี่ยนผลการตัดสินของผู้เข้าชิง 1 คน (ON CONFLICT = ตัดสินใหม่ทับของเดิมขณะรอบยังเปิด)
export async function upsertDecision(
  roundId: string,
  userId: string,
  decision: SelectionDecision,
  reason: string,
  decidedBy: string,
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO selection_candidates (round_id, user_id, decision, reason, decided_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (round_id, user_id)
     DO UPDATE SET decision = EXCLUDED.decision, reason = EXCLUDED.reason, decided_by = EXCLUDED.decided_by, decided_at = now()`,
    [roundId, userId, decision, reason, decidedBy],
  );
}

export interface RankingRow {
  userId: string;
  name: string | null;
  email: string;
  clubs: string[];
  competitionCount: number;
  gold: number;
  silver: number;
  bronze: number;
  bestRank: number | null;
  activityCount: number;
  achievementCount: number;
  bestStats: { nameTh: string; unit: string | null; better: 'higher' | 'lower'; best: number }[];
  decision: SelectionDecision | null;
  reason: string | null;
}

/**
 * ตารางจัดอันดับผู้เข้าชิงของรอบ (ข้อมูลของปีงบประมาณ [from, to])
 * - ผู้เข้าชิง (CTE cand): นักกีฬาปัจจุบันของชนิดกีฬา ($1) จากทุกชมรม
 *   ถ้าไม่ระบุชนิดกีฬา (รางวัล) = นักกีฬาทุกชนิด ∪ ผู้มีผลงานที่รับรองแล้วในปีนั้น (UNION ตัดคนซ้ำ)
 * - ตัวชี้วัดแยกเป็น CTE ที่ GROUP BY ผู้ใช้ แล้ว LEFT JOIN (ไม่มีข้อมูล = 0)
 * - เรียง: ทอง → เงิน → ทองแดง → อันดับดีที่สุด → จำนวนแข่ง → ผลงาน → การเข้าร่วม (คนเป็นผู้ตัดสิน ลำดับนี้ช่วยอ่านเท่านั้น)
 * $4 = round id (ผลการตัดสิน), $5 = user id (null = ทุกคน ใช้ตรวจว่าเป็นผู้เข้าชิง)
 */
export async function listRanking(
  sportId: string | null,
  from: string,
  to: string,
  roundId: string,
  onlyUserId: string | null,
  db: Queryable = pool,
): Promise<RankingRow[]> {
  const result = await db.query<RankingRow>(
    `WITH cand AS (
       SELECT a.user_id FROM club_athletes a
         JOIN clubs cl ON cl.id = a.club_id AND cl.deleted_at IS NULL
        WHERE a.ended_at IS NULL AND ($1::uuid IS NULL OR a.sport_id = $1)
       UNION
       SELECT ac.user_id FROM club_achievements ac
        WHERE $1::uuid IS NULL AND ac.status = 'approved' AND ac.achieved_on BETWEEN $2::date AND $3::date
     ),
     res AS (
       SELECT r.user_id,
              count(*)::int AS competitions,
              count(*) FILTER (WHERE r.medal = 'gold')::int AS gold,
              count(*) FILTER (WHERE r.medal = 'silver')::int AS silver,
              count(*) FILTER (WHERE r.medal = 'bronze')::int AS bronze,
              min(r.rank) AS best_rank
         FROM sport_competition_results r
         JOIN sport_competitions c ON c.id = r.competition_id AND c.deleted_at IS NULL
        WHERE c.held_from BETWEEN $2::date AND $3::date AND ($1::uuid IS NULL OR c.sport_id = $1)
        GROUP BY r.user_id
     ),
     att AS (
       SELECT ap.user_id, count(*)::int AS activities
         FROM club_activity_participants ap
         JOIN club_activities a ON a.id = ap.activity_id AND a.deleted_at IS NULL
        WHERE a.held_on BETWEEN $2::date AND $3::date
        GROUP BY ap.user_id
     ),
     ach AS (
       SELECT user_id, count(*)::int AS achievements
         FROM club_achievements
        WHERE status = 'approved' AND achieved_on BETWEEN $2::date AND $3::date
        GROUP BY user_id
     )
     SELECT u.id AS "userId", u.name, u.email,
            ARRAY(SELECT DISTINCT cl.name_th FROM club_athletes a JOIN clubs cl ON cl.id = a.club_id
                   WHERE a.user_id = u.id AND a.ended_at IS NULL AND ($1::uuid IS NULL OR a.sport_id = $1)
                   ORDER BY cl.name_th) AS clubs,
            COALESCE(res.competitions, 0) AS "competitionCount",
            COALESCE(res.gold, 0) AS gold, COALESCE(res.silver, 0) AS silver, COALESCE(res.bronze, 0) AS bronze,
            res.best_rank AS "bestRank",
            COALESCE(att.activities, 0) AS "activityCount",
            COALESCE(ach.achievements, 0) AS "achievementCount",
            COALESCE((
              SELECT json_agg(json_build_object('nameTh', b.name_th, 'unit', b.unit, 'better', b.better, 'best', b.best) ORDER BY b.sort_order)
                FROM (
                  SELECT d.name_th, d.unit, d.better, d.sort_order,
                         (CASE WHEN d.better = 'higher' THEN max(rs.value) ELSE min(rs.value) END)::float8 AS best
                    FROM sport_result_stats rs
                    JOIN sport_competition_results r ON r.id = rs.result_id AND r.user_id = u.id
                    JOIN sport_competitions c ON c.id = r.competition_id AND c.deleted_at IS NULL
                         AND c.held_from BETWEEN $2::date AND $3::date
                    JOIN sport_stat_definitions d ON d.id = rs.stat_definition_id
                   WHERE $1::uuid IS NOT NULL AND d.sport_id = $1
                   GROUP BY d.id, d.name_th, d.unit, d.better, d.sort_order
                ) b
            ), '[]'::json) AS "bestStats",
            sc.decision, sc.reason
       FROM cand
       JOIN users u ON u.id = cand.user_id AND u.is_active
       LEFT JOIN res ON res.user_id = u.id
       LEFT JOIN att ON att.user_id = u.id
       LEFT JOIN ach ON ach.user_id = u.id
       LEFT JOIN selection_candidates sc ON sc.round_id = $4 AND sc.user_id = u.id
      WHERE $5::uuid IS NULL OR u.id = $5
      ORDER BY "gold" DESC, "silver" DESC, "bronze" DESC, "bestRank" ASC NULLS LAST,
               "competitionCount" DESC, "achievementCount" DESC, "activityCount" DESC, u.name NULLS LAST
      LIMIT 500`,
    [sportId, from, to, roundId, onlyUserId],
  );
  return result.rows;
}

export interface ResultRow {
  userId: string;
  name: string | null;
  decision: 'selected' | 'reserve';
  reason: string;
  clubs: string[];
}

// ผลที่ประกาศ (คัดเลือก/สำรอง) ของรอบที่ปิดแล้ว
export async function listAnnouncedResults(roundId: string, db: Queryable = pool): Promise<ResultRow[]> {
  const result = await db.query<ResultRow>(
    `SELECT u.id AS "userId", COALESCE(u.name, u.email) AS name, sc.decision, sc.reason,
            ARRAY(SELECT DISTINCT cl.name_th FROM club_athletes a JOIN clubs cl ON cl.id = a.club_id
                   WHERE a.user_id = u.id AND a.ended_at IS NULL ORDER BY cl.name_th) AS clubs
       FROM selection_candidates sc
       JOIN users u ON u.id = sc.user_id
      WHERE sc.round_id = $1 AND sc.decision IN ('selected', 'reserve')
      ORDER BY sc.decision, u.name NULLS LAST
      LIMIT 500`,
    [roundId],
  );
  return result.rows;
}
