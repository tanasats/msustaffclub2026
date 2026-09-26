import { pool, type Queryable } from '../db/pool.js';

// ---------- ชนิดกีฬา (ข้อมูลหลัก) ----------

export interface SportRow {
  id: string;
  code: string;
  nameTh: string;
  isActive: boolean;
}

const SPORT_COLUMNS = 'id, code, name_th AS "nameTh", is_active AS "isActive"';

export async function listSports(includeInactive: boolean, db: Queryable = pool): Promise<SportRow[]> {
  const result = await db.query<SportRow>(
    `SELECT ${SPORT_COLUMNS} FROM sports WHERE ($1 OR is_active) ORDER BY sort_order, name_th LIMIT 500`,
    [includeInactive],
  );
  return result.rows;
}

// ชน unique code → 23505
export async function insertSport(code: string, nameTh: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO sports (code, name_th, sort_order)
     VALUES ($1, $2, (SELECT COALESCE(max(sort_order), 0) + 1 FROM sports))
     RETURNING id`,
    [code, nameTh],
  );
  return result.rows[0]!.id;
}

export async function updateSport(id: string, nameTh: string, isActive: boolean, db: Queryable): Promise<boolean> {
  const result = await db.query('UPDATE sports SET name_th = $2, is_active = $3 WHERE id = $1', [id, nameTh, isActive]);
  return (result.rowCount ?? 0) > 0;
}

// ---------- ชนิดกีฬาของชมรม ----------

export interface ClubSportRow {
  sportId: string;
  code: string;
  nameTh: string;
  athleteCount: number;
}

// ชนิดกีฬาของชมรม พร้อมจำนวนนักกีฬาปัจจุบัน
export async function listClubSports(clubId: string, db: Queryable = pool): Promise<ClubSportRow[]> {
  const result = await db.query<ClubSportRow>(
    `SELECT s.id AS "sportId", s.code, s.name_th AS "nameTh",
            (SELECT count(*)::int FROM club_athletes a
              WHERE a.club_id = cs.club_id AND a.sport_id = s.id AND a.ended_at IS NULL) AS "athleteCount"
       FROM club_sports cs
       JOIN sports s ON s.id = cs.sport_id
      WHERE cs.club_id = $1
      ORDER BY s.sort_order, s.name_th
      LIMIT 100`,
    [clubId],
  );
  return result.rows;
}

// ชนิดกีฬาในรายการที่ใช้งานอยู่ (ใช้ตรวจ id ที่ส่งมา)
export async function findActiveSportIds(sportIds: string[], db: Queryable): Promise<string[]> {
  const result = await db.query<{ id: string }>('SELECT id FROM sports WHERE id = ANY($1::uuid[]) AND is_active', [sportIds]);
  return result.rows.map((row) => row.id);
}

// ชนิดกีฬาที่จะถูกเอาออกจากชมรมแต่ยังมีนักกีฬาอยู่ (ต้องให้นักกีฬาพ้นก่อน)
export async function findSportsWithAthletes(clubId: string, keepSportIds: string[], db: Queryable): Promise<string[]> {
  const result = await db.query<{ nameTh: string }>(
    `SELECT DISTINCT s.name_th AS "nameTh"
       FROM club_athletes a
       JOIN sports s ON s.id = a.sport_id
      WHERE a.club_id = $1 AND a.ended_at IS NULL AND NOT (a.sport_id = ANY($2::uuid[]))`,
    [clubId, keepSportIds],
  );
  return result.rows.map((row) => row.nameTh);
}

/**
 * แทนที่ชนิดกีฬาของชมรมทั้งชุด: ลบที่ไม่อยู่ในรายการใหม่ แล้วเพิ่มที่ยังไม่มี (ON CONFLICT DO NOTHING)
 */
export async function replaceClubSports(clubId: string, sportIds: string[], userId: string, db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_sports WHERE club_id = $1 AND NOT (sport_id = ANY($2::uuid[]))', [clubId, sportIds]);
  await db.query(
    `INSERT INTO club_sports (club_id, sport_id, created_by)
     SELECT $1, s, $3 FROM unnest($2::uuid[]) AS s
     ON CONFLICT (club_id, sport_id) DO NOTHING`,
    [clubId, sportIds, userId],
  );
}

export async function clubHasSport(clubId: string, sportId: string, db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM club_sports WHERE club_id = $1 AND sport_id = $2) AS "exists"',
    [clubId, sportId],
  );
  return result.rows[0]?.exists ?? false;
}

// ---------- นักกีฬา ----------

export interface AthleteRecord {
  id: string;
  clubId: string;
  userId: string;
  sportId: string;
}

// ชน unique club_athletes_current_key ถ้าลงทะเบียนกีฬาเดิมซ้ำ → 23505
export async function insertAthlete(
  input: { clubId: string; userId: string; sportId: string; eventOrPosition: string | null },
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_athletes (club_id, user_id, sport_id, event_or_position) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.clubId, input.userId, input.sportId, input.eventOrPosition],
  );
  return result.rows[0]!.id;
}

export async function lockCurrentAthlete(id: string, db: Queryable): Promise<AthleteRecord | null> {
  const result = await db.query<AthleteRecord>(
    `SELECT id, club_id AS "clubId", user_id AS "userId", sport_id AS "sportId"
       FROM club_athletes WHERE id = $1 AND ended_at IS NULL FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateAthleteEvent(id: string, eventOrPosition: string | null, db: Queryable): Promise<void> {
  await db.query('UPDATE club_athletes SET event_or_position = $2 WHERE id = $1', [id, eventOrPosition]);
}

export async function endAthlete(id: string, endedBy: string, db: Queryable): Promise<void> {
  await db.query('UPDATE club_athletes SET ended_at = now(), ended_by = $2 WHERE id = $1', [id, endedBy]);
}

// พ้นสมาชิกแล้ว → สิ้นสุดการเป็นนักกีฬาทุกชนิดในชมรมนั้น (เรียกใน transaction เดียวกับการพ้นสมาชิก)
export async function endAthletesOfMember(clubId: string, userId: string, endedBy: string, db: Queryable): Promise<void> {
  await db.query(
    'UPDATE club_athletes SET ended_at = now(), ended_by = $3 WHERE club_id = $1 AND user_id = $2 AND ended_at IS NULL',
    [clubId, userId, endedBy],
  );
}

export interface AthleteRow {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  sportId: string;
  sportName: string;
  eventOrPosition: string | null;
  // วันที่เริ่มเป็นนักกีฬา 'YYYY-MM-DD'
  since: string;
}

// นักกีฬาปัจจุบันของชมรม (เรียงตามชนิดกีฬาแล้วชื่อ)
export async function listClubAthletes(clubId: string, db: Queryable = pool): Promise<AthleteRow[]> {
  const result = await db.query<AthleteRow>(
    `SELECT a.id, a.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName",
            a.sport_id AS "sportId", s.name_th AS "sportName", a.event_or_position AS "eventOrPosition",
            -- วันที่ลงทะเบียนตามเวลาประเทศไทย (แปลง timestamptz → date ก่อน to_char)
            to_char((a.created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS since
       FROM club_athletes a
       JOIN users u ON u.id = a.user_id
       JOIN sports s ON s.id = a.sport_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE a.club_id = $1 AND a.ended_at IS NULL
      ORDER BY s.sort_order, u.name NULLS LAST, u.email
      LIMIT 1000`,
    [clubId],
  );
  return result.rows;
}
