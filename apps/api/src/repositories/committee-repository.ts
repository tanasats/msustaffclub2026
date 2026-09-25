import { pool, type Queryable } from '../db/pool.js';

export type CommitteeEndReason =
  | 'term_ended'
  | 'resigned_position'
  | 'left_university'
  | 'disciplinary'
  | 'removed_by_resolution'
  | 'deceased'
  | 'club_dissolved'
  | 'replaced';
export type CommitteeAction = 'appointed' | 'ended';

export interface CommitteeRecord {
  id: string;
  userId: string;
  positionCode: string;
}

/**
 * ล็อกแถวชมรมแบบ FOR UPDATE (null = ไม่พบ/ถูกลบ)
 * การเปลี่ยนกรรมการต้องทำทีละรายการต่อชมรม เพื่อไม่ให้ 2 transaction นับจำนวนในตำแหน่งพร้อมกัน
 * แล้วแต่งตั้งเกิน max_per_club หรือโอนตำแหน่งประธานซ้อนกันจนมีประธาน 2 คน
 */
export async function lockClubForCommitteeChange(
  clubId: string,
  db: Queryable,
): Promise<'active' | 'suspended' | 'dissolved' | null> {
  const result = await db.query<{ status: 'active' | 'suspended' | 'dissolved' }>(
    'SELECT status FROM clubs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [clubId],
  );
  return result.rows[0]?.status ?? null;
}

// ตำแหน่งกรรมการที่ยังดำรงอยู่ตาม id (ต้องเป็นของชมรมนี้) พร้อมล็อกแถว
export async function lockCurrentCommitteeMember(id: string, clubId: string, db: Queryable): Promise<CommitteeRecord | null> {
  const result = await db.query<CommitteeRecord>(
    `SELECT cm.id, cm.user_id AS "userId", p.code AS "positionCode"
       FROM club_committee_members cm
       JOIN club_positions p ON p.id = cm.position_id
      WHERE cm.id = $1 AND cm.club_id = $2 AND cm.ended_on IS NULL
      FOR UPDATE OF cm`,
    [id, clubId],
  );
  return result.rows[0] ?? null;
}

// ตำแหน่งกรรมการที่ผู้ใช้ดำรงอยู่ในชมรม (1 คน 1 ตำแหน่ง) ใช้ partial index club_committee_members_current_idx
export async function lockCurrentCommitteeOfUser(clubId: string, userId: string, db: Queryable): Promise<CommitteeRecord | null> {
  const result = await db.query<CommitteeRecord>(
    `SELECT cm.id, cm.user_id AS "userId", p.code AS "positionCode"
       FROM club_committee_members cm
       JOIN club_positions p ON p.id = cm.position_id
      WHERE cm.club_id = $1 AND cm.user_id = $2 AND cm.ended_on IS NULL
      ORDER BY cm.started_on
      LIMIT 1
      FOR UPDATE OF cm`,
    [clubId, userId],
  );
  return result.rows[0] ?? null;
}

// ผู้ดำรงตำแหน่งตาม code (เช่น ประธาน) ในชมรม พร้อมล็อกแถว
export async function lockCurrentHolders(clubId: string, positionCode: string, db: Queryable): Promise<CommitteeRecord[]> {
  const result = await db.query<CommitteeRecord>(
    `SELECT cm.id, cm.user_id AS "userId", p.code AS "positionCode"
       FROM club_committee_members cm
       JOIN club_positions p ON p.id = cm.position_id
      WHERE cm.club_id = $1 AND p.code = $2 AND cm.ended_on IS NULL
      ORDER BY cm.started_on
      LIMIT 50
      FOR UPDATE OF cm`,
    [clubId, positionCode],
  );
  return result.rows;
}

// จำนวนผู้ดำรงตำแหน่งนี้อยู่ในชมรม (ใช้ตรวจ max_per_club)
export async function countCurrentInPosition(clubId: string, positionId: string, db: Queryable): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM club_committee_members
      WHERE club_id = $1 AND position_id = $2 AND ended_on IS NULL`,
    [clubId, positionId],
  );
  return result.rows[0]?.count ?? 0;
}

// เป็นที่ปรึกษาปัจจุบันของชมรมหรือไม่ (ที่ปรึกษาเป็นกรรมการไม่ได้)
export async function isCurrentAdvisor(clubId: string, userId: string, db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM club_advisors WHERE club_id = $1 AND user_id = $2 AND ended_on IS NULL
     ) AS "exists"`,
    [clubId, userId],
  );
  return result.rows[0]?.exists ?? false;
}

export interface NewCommitteeMember {
  clubId: string;
  userId: string;
  positionId: string;
  positionTitle: string;
  workLocation: string | null;
  contactPhone: string | null;
  startedOn: string;
}

/**
 * แต่งตั้งกรรมการ
 * sort_order = ลำดับถัดไปในตำแหน่งเดียวกัน (เช่น รองประธานคนที่ 1, 2) คำนวณด้วย subquery ในคำสั่งเดียว
 */
export async function insertCommitteeMember(input: NewCommitteeMember, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_committee_members
       (club_id, user_id, position_id, position_title, sort_order, work_location, contact_phone, started_on)
     VALUES ($1, $2, $3, $4,
             (SELECT COALESCE(max(sort_order), 0) + 1
                FROM club_committee_members
               WHERE club_id = $1 AND position_id = $3 AND ended_on IS NULL),
             $5, $6, $7::date)
     RETURNING id`,
    [input.clubId, input.userId, input.positionId, input.positionTitle, input.workLocation, input.contactPhone, input.startedOn],
  );
  return result.rows[0]!.id;
}

// สิ้นสุดตำแหน่ง (ไม่ลบแถว เก็บเป็นประวัติ) ended_on ใช้วันที่ตามเวลาประเทศไทย
export async function endCommitteeMember(id: string, endedOn: string, reason: CommitteeEndReason, db: Queryable): Promise<void> {
  await db.query(
    'UPDATE club_committee_members SET ended_on = $2::date, end_reason = $3 WHERE id = $1',
    [id, endedOn, reason],
  );
}

export async function insertCommitteeEvent(
  input: { committeeMemberId: string; actorUserId: string | null; action: CommitteeAction; note: string | null },
  db: Queryable,
): Promise<void> {
  await db.query(
    'INSERT INTO club_committee_events (committee_member_id, actor_user_id, action, note) VALUES ($1, $2, $3, $4)',
    [input.committeeMemberId, input.actorUserId, input.action, input.note],
  );
}

export interface CommitteeHistoryRow {
  id: string;
  name: string | null;
  email: string;
  positionTitle: string;
  startedOn: string;
  endedOn: string;
  endReason: CommitteeEndReason;
  endNote: string | null;
  endedByName: string | null;
}

/**
 * กรรมการที่พ้นตำแหน่งแล้ว (ล่าสุดก่อน)
 * LEFT JOIN LATERAL หา event 'ended' ล่าสุดของแต่ละแถว เพื่อบอกว่าใครให้พ้นตำแหน่งและหมายเหตุ
 * (ข้อมูลเก่าก่อนมีตาราง event จะได้ค่า NULL)
 */
export async function listCommitteeHistory(clubId: string, limit: number, db: Queryable = pool): Promise<CommitteeHistoryRow[]> {
  const result = await db.query<CommitteeHistoryRow>(
    `SELECT cm.id, u.name, u.email, cm.position_title AS "positionTitle",
            to_char(cm.started_on, 'YYYY-MM-DD') AS "startedOn",
            to_char(cm.ended_on, 'YYYY-MM-DD') AS "endedOn",
            cm.end_reason AS "endReason", ev.note AS "endNote",
            COALESCE(actor.name, actor.email) AS "endedByName"
       FROM club_committee_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN LATERAL (
         SELECT e.note, e.actor_user_id
           FROM club_committee_events e
          WHERE e.committee_member_id = cm.id AND e.action = 'ended'
          ORDER BY e.created_at DESC
          LIMIT 1
       ) ev ON true
       LEFT JOIN users actor ON actor.id = ev.actor_user_id
      WHERE cm.club_id = $1 AND cm.ended_on IS NOT NULL
      ORDER BY cm.ended_on DESC, cm.updated_at DESC
      LIMIT $2`,
    [clubId, limit],
  );
  return result.rows;
}
