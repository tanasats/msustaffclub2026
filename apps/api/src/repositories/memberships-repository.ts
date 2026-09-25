import { pool, type Queryable } from '../db/pool.js';

export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'ended' | 'withdrawn';
export type MembershipAction = 'applied' | 'withdrawn' | 'approved' | 'rejected' | 'left' | 'removed';
export type MembershipEndReason =
  | 'resigned'
  | 'left_university'
  | 'disciplinary'
  | 'removed_by_resolution'
  | 'deceased'
  | 'club_dissolved';

export interface MembershipRecord {
  id: string;
  clubId: string;
  userId: string;
  status: MembershipStatus;
}

const COLUMNS = 'id, club_id AS "clubId", user_id AS "userId", status';

// สมัครสมาชิก (ถ้ามีใบสมัคร/สมาชิกภาพที่ยังมีผลอยู่แล้ว จะชน partial unique index club_memberships_current_key → 23505)
export async function insertPendingMembership(clubId: string, userId: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_memberships (club_id, user_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
    [clubId, userId],
  );
  return result.rows[0]!.id;
}

// ใบสมัคร/สมาชิกภาพที่ยังมีผลของผู้ใช้ในชมรม พร้อมล็อกแถว (มีได้ไม่เกิน 1 แถวตาม partial unique index)
export async function lockCurrentMembership(clubId: string, userId: string, db: Queryable): Promise<MembershipRecord | null> {
  const result = await db.query<MembershipRecord>(
    `SELECT ${COLUMNS} FROM club_memberships
      WHERE club_id = $1 AND user_id = $2 AND status IN ('pending', 'active')
      FOR UPDATE`,
    [clubId, userId],
  );
  return result.rows[0] ?? null;
}

export async function lockMembership(membershipId: string, clubId: string, db: Queryable): Promise<MembershipRecord | null> {
  const result = await db.query<MembershipRecord>(
    `SELECT ${COLUMNS} FROM club_memberships WHERE id = $1 AND club_id = $2 FOR UPDATE`,
    [membershipId, clubId],
  );
  return result.rows[0] ?? null;
}

// อนุมัติ/ปฏิเสธใบสมัคร (บันทึกผู้ตัดสินและเวลา)
export async function decideMembership(
  membershipId: string,
  status: 'active' | 'rejected',
  deciderId: string,
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE club_memberships SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
    [membershipId, status, deciderId],
  );
}

export async function withdrawMembership(membershipId: string, db: Queryable): Promise<void> {
  await db.query(`UPDATE club_memberships SET status = 'withdrawn' WHERE id = $1`, [membershipId]);
}

// สิ้นสุดการเป็นสมาชิก (ลาออก/พ้นสภาพ) — ended_on ใช้วันที่ตามเวลาประเทศไทย
export async function endMembership(
  membershipId: string,
  endedOn: string,
  reason: MembershipEndReason,
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE club_memberships SET status = 'ended', ended_on = $2::date, end_reason = $3 WHERE id = $1`,
    [membershipId, endedOn, reason],
  );
}

export async function insertMembershipEvent(
  input: { membershipId: string; actorUserId: string | null; action: MembershipAction; note: string | null },
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO club_membership_events (membership_id, actor_user_id, action, note) VALUES ($1, $2, $3, $4)`,
    [input.membershipId, input.actorUserId, input.action, input.note],
  );
}

// เป็นกรรมการชุดปัจจุบันของชมรมหรือไม่ (ใช้ partial index club_committee_members_current_idx)
export async function isCurrentCommitteeMember(clubId: string, userId: string, db: Queryable = pool): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM club_committee_members WHERE club_id = $1 AND user_id = $2 AND ended_on IS NULL
     ) AS "exists"`,
    [clubId, userId],
  );
  return result.rows[0]?.exists ?? false;
}

export interface MembershipRequestRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  appliedAt: Date;
}

// ใบสมัครที่รออนุมัติ (มาก่อนได้ก่อน) ใช้ index club_memberships_club_id_status_idx
export async function listPendingRequests(clubId: string, db: Queryable = pool): Promise<MembershipRequestRow[]> {
  const result = await db.query<MembershipRequestRow>(
    `SELECT m.id AS "membershipId", m.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName",
            m.applied_at AS "appliedAt"
       FROM club_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE m.club_id = $1 AND m.status = 'pending'
      ORDER BY m.applied_at
      LIMIT 200`,
    [clubId],
  );
  return result.rows;
}

// สถานะชมรม (null = ไม่พบ/ถูกลบ) พร้อมล็อก เพื่อไม่ให้ชมรมถูกระงับระหว่างทำรายการ
export async function lockClubStatus(clubId: string, db: Queryable): Promise<'active' | 'suspended' | 'dissolved' | null> {
  const result = await db.query<{ status: 'active' | 'suspended' | 'dissolved' }>(
    'SELECT status FROM clubs WHERE id = $1 AND deleted_at IS NULL FOR SHARE',
    [clubId],
  );
  return result.rows[0]?.status ?? null;
}
