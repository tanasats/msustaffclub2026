import { pool, type Queryable } from '../db/pool.js';

export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'ended' | 'withdrawn' | 'deleted' | 'invited' | 'declined';
export type MembershipAction =
  | 'applied'
  | 'withdrawn'
  | 'approved'
  | 'rejected'
  | 'left'
  | 'removed'
  | 'resign_requested'
  | 'resign_cancelled'
  | 'deleted'
  | 'restored'
  | 'invited'
  | 'invite_accepted'
  | 'invite_declined'
  | 'invite_cancelled';
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

// ใบสมัคร/คำเชิญ/สมาชิกภาพที่ยังมีผลของผู้ใช้ในชมรม พร้อมล็อกแถว (มีได้ไม่เกิน 1 แถวตาม partial unique index)
export async function lockCurrentMembership(clubId: string, userId: string, db: Queryable): Promise<MembershipRecord | null> {
  const result = await db.query<MembershipRecord>(
    `SELECT ${COLUMNS} FROM club_memberships
      WHERE club_id = $1 AND user_id = $2 AND status IN ('pending', 'active', 'invited')
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
// ล้างคำขอลาออกที่ค้าง (ถ้ามี) ในคำสั่งเดียวกัน ตาม CHECK resign_consistency
export async function endMembership(
  membershipId: string,
  endedOn: string,
  reason: MembershipEndReason,
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE club_memberships
        SET status = 'ended', ended_on = $2::date, end_reason = $3, resign_requested_at = NULL, resign_note = NULL
      WHERE id = $1`,
    [membershipId, endedOn, reason],
  );
}

// คืน id ของ event (ใช้เป็นตัวระบุเหตุการณ์ของอีเมลแจ้งเตือน)
export async function insertMembershipEvent(
  input: { membershipId: string; actorUserId: string | null; action: MembershipAction; note: string | null },
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_membership_events (membership_id, actor_user_id, action, note) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.membershipId, input.actorUserId, input.action, input.note],
  );
  return result.rows[0]!.id;
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

/**
 * ผลปฏิเสธใบสมัครล่าสุดของผู้ใช้ในชมรม (แสดงเหตุผลให้ผู้สมัครเห็น)
 * เฉพาะเมื่อแถวล่าสุดของผู้ใช้ในชมรมเป็น rejected (สมัครใหม่แล้ว = ไม่แสดง)
 */
export async function findLatestRejection(
  clubId: string,
  userId: string,
  db: Queryable = pool,
): Promise<{ note: string | null; decidedAt: Date } | null> {
  const result = await db.query<{ note: string | null; decidedAt: Date }>(
    `SELECT (SELECT e.note FROM club_membership_events e
              WHERE e.membership_id = m.id AND e.action = 'rejected'
              ORDER BY e.created_at DESC LIMIT 1) AS note,
            m.decided_at AS "decidedAt"
       FROM (SELECT id, status, decided_at FROM club_memberships
              WHERE club_id = $1 AND user_id = $2
              ORDER BY applied_at DESC LIMIT 1) m
      WHERE m.status = 'rejected'`,
    [clubId, userId],
  );
  return result.rows[0] ?? null;
}

// ---------- ยื่นลาออก ----------

// บันทึกคำขอลาออก (เฉพาะสมาชิก active ที่ยังไม่ได้ยื่น) คืน false ถ้าไม่เข้าเงื่อนไข
export async function requestResignation(membershipId: string, note: string, db: Queryable): Promise<boolean> {
  const result = await db.query(
    `UPDATE club_memberships SET resign_requested_at = now(), resign_note = $2
      WHERE id = $1 AND status = 'active' AND resign_requested_at IS NULL`,
    [membershipId, note],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function cancelResignation(membershipId: string, db: Queryable): Promise<boolean> {
  const result = await db.query(
    `UPDATE club_memberships SET resign_requested_at = NULL, resign_note = NULL
      WHERE id = $1 AND status = 'active' AND resign_requested_at IS NOT NULL`,
    [membershipId],
  );
  return (result.rowCount ?? 0) > 0;
}

// คำขอลาออกที่ยังไม่มีผลของผู้ใช้ในชมรม (แสดงที่หน้าชมรม)
export async function findMyResignation(
  clubId: string,
  userId: string,
  db: Queryable = pool,
): Promise<{ requestedAt: Date; note: string } | null> {
  const result = await db.query<{ requestedAt: Date; note: string }>(
    `SELECT resign_requested_at AS "requestedAt", resign_note AS note FROM club_memberships
      WHERE club_id = $1 AND user_id = $2 AND status = 'active' AND resign_requested_at IS NOT NULL`,
    [clubId, userId],
  );
  return result.rows[0] ?? null;
}

export interface ResignationRequestRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  requestedAt: Date;
  note: string;
}

// คำขอลาออกที่รอกรรมการรับทราบ (เก่าสุดก่อน)
export async function listResignationRequests(clubId: string, db: Queryable = pool): Promise<ResignationRequestRow[]> {
  const result = await db.query<ResignationRequestRow>(
    `SELECT m.id AS "membershipId", m.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName",
            m.resign_requested_at AS "requestedAt", m.resign_note AS note
       FROM club_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE m.club_id = $1 AND m.status = 'active' AND m.resign_requested_at IS NOT NULL
      ORDER BY m.resign_requested_at
      LIMIT 200`,
    [clubId],
  );
  return result.rows;
}

/**
 * คำขอลาออกที่ครบกำหนดมีผลอัตโนมัติ (ยื่นมาแล้วอย่างน้อย days วัน) พร้อมล็อกแถว
 * SKIP LOCKED: ถ้ากรรมการกำลังรับทราบแถวเดียวกันอยู่ ให้ข้ามไปก่อน ไม่ทำซ้ำ
 */
export async function lockDueResignations(
  days: number,
  limit: number,
  db: Queryable,
): Promise<{ id: string; clubId: string; userId: string }[]> {
  const result = await db.query<{ id: string; clubId: string; userId: string }>(
    `SELECT id, club_id AS "clubId", user_id AS "userId" FROM club_memberships
      WHERE status = 'active' AND resign_requested_at IS NOT NULL
        AND resign_requested_at <= now() - make_interval(days => $1)
      ORDER BY resign_requested_at
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [days, limit],
  );
  return result.rows;
}

// ---------- ลบ / กู้คืน (soft delete) ----------

// สถานะที่กรรมการลบได้ (ผู้ที่พ้นสภาพแล้วเป็นประวัติ ลบไม่ได้) — ต้องตรงกับ CHECK status_before_delete_check
export const DELETABLE_MEMBERSHIP_STATUSES = ['pending', 'active', 'rejected', 'withdrawn'] as const;

/**
 * ลบรายชื่อ: เก็บสถานะเดิมไว้ใน status_before_delete แล้วเปลี่ยนเป็น deleted (ทางขวาของ SET อ่านค่าเดิมของแถว)
 * ล้างคำขอลาออกที่ค้างในคำสั่งเดียวกัน คืน false ถ้าสถานะลบไม่ได้
 */
export async function softDeleteMembership(membershipId: string, deletedBy: string, db: Queryable): Promise<boolean> {
  const result = await db.query(
    `UPDATE club_memberships
        SET status_before_delete = status, status = 'deleted', deleted_at = now(), deleted_by = $2,
            resign_requested_at = NULL, resign_note = NULL
      WHERE id = $1 AND status = ANY($3::text[])`,
    [membershipId, deletedBy, DELETABLE_MEMBERSHIP_STATUSES],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * กู้คืนเป็นสถานะเดิม คืนสถานะที่กู้คืน (null = ไม่ได้ถูกลบ)
 * ถ้าสถานะเดิมเป็น pending/active และผู้ใช้มีใบสมัคร/สมาชิกภาพใหม่แล้ว จะชน unique index club_memberships_current_key → 23505
 */
export async function restoreMembership(membershipId: string, db: Queryable): Promise<MembershipStatus | null> {
  const result = await db.query<{ status: MembershipStatus }>(
    `UPDATE club_memberships
        SET status = status_before_delete, deleted_at = NULL, deleted_by = NULL, status_before_delete = NULL
      WHERE id = $1 AND status = 'deleted'
      RETURNING status`,
    [membershipId],
  );
  return result.rows[0]?.status ?? null;
}

// ---------- คำเชิญเข้าชมรม ----------

// เชิญ (ถ้ามีใบสมัคร/คำเชิญ/สมาชิกภาพที่ยังมีผลอยู่แล้ว จะชน partial unique index → 23505)
export async function insertInvitation(clubId: string, userId: string, invitedBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_memberships (club_id, user_id, status, invited_by) VALUES ($1, $2, 'invited', $3) RETURNING id`,
    [clubId, userId, invitedBy],
  );
  return result.rows[0]!.id;
}

/**
 * ตอบคำเชิญ: ตอบรับ → active (ผู้อนุมัติ = ผู้เชิญ เพราะกรรมการเป็นผู้เชิญเอง) / ปฏิเสธ → declined
 * กรรมการยกเลิกคำเชิญ → withdrawn — ทุกกรณีต้องยังเป็น invited อยู่ (เงื่อนไขใน WHERE กันทำซ้ำ)
 */
export async function resolveInvitation(
  membershipId: string,
  outcome: 'accepted' | 'declined' | 'cancelled',
  db: Queryable,
): Promise<boolean> {
  const sql = {
    accepted: `UPDATE club_memberships SET status = 'active', decided_by = invited_by, decided_at = now() WHERE id = $1 AND status = 'invited'`,
    declined: `UPDATE club_memberships SET status = 'declined' WHERE id = $1 AND status = 'invited'`,
    cancelled: `UPDATE club_memberships SET status = 'withdrawn' WHERE id = $1 AND status = 'invited'`,
  }[outcome];
  const result = await db.query(sql, [membershipId]);
  return (result.rowCount ?? 0) > 0;
}

export interface InvitationRow {
  membershipId: string;
  clubId: string;
  clubName: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  invitedByName: string | null;
  invitedAt: Date;
}

const INVITATION_SELECT = `
  SELECT m.id AS "membershipId", m.club_id AS "clubId", c.name_th AS "clubName",
         m.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName",
         iv.name AS "invitedByName", m.applied_at AS "invitedAt"
    FROM club_memberships m
    JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL
    JOIN users u ON u.id = m.user_id
    LEFT JOIN users iv ON iv.id = m.invited_by
    LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN org_units ou ON ou.id = sp.org_unit_id`;

// คำเชิญที่รอตอบของชมรม (สำหรับกรรมการ)
export async function listClubInvitations(clubId: string, db: Queryable = pool): Promise<InvitationRow[]> {
  const result = await db.query<InvitationRow>(
    `${INVITATION_SELECT} WHERE m.club_id = $1 AND m.status = 'invited' ORDER BY m.applied_at LIMIT 200`,
    [clubId],
  );
  return result.rows;
}

// คำเชิญที่รอฉันตอบ (ทุกชมรมที่ยังดำเนินการอยู่) ใช้ index club_memberships_invited_user_idx
export async function listMyInvitations(userId: string, db: Queryable = pool): Promise<InvitationRow[]> {
  const result = await db.query<InvitationRow>(
    `${INVITATION_SELECT} WHERE m.user_id = $1 AND m.status = 'invited' AND c.status = 'active' ORDER BY m.applied_at DESC LIMIT 50`,
    [userId],
  );
  return result.rows;
}

export async function countMyInvitations(userId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM club_memberships m
       JOIN clubs c ON c.id = m.club_id AND c.deleted_at IS NULL AND c.status = 'active'
      WHERE m.user_id = $1 AND m.status = 'invited'`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

// คำเชิญที่รอฉันตอบในชมรมนี้ (แสดงที่หน้าชมรม)
export async function findMyInvitation(
  clubId: string,
  userId: string,
  db: Queryable = pool,
): Promise<{ invitedAt: Date; invitedByName: string | null; note: string | null } | null> {
  const result = await db.query<{ invitedAt: Date; invitedByName: string | null; note: string | null }>(
    `SELECT m.applied_at AS "invitedAt", iv.name AS "invitedByName",
            (SELECT e.note FROM club_membership_events e
              WHERE e.membership_id = m.id AND e.action = 'invited' ORDER BY e.created_at DESC LIMIT 1) AS note
       FROM club_memberships m
       LEFT JOIN users iv ON iv.id = m.invited_by
      WHERE m.club_id = $1 AND m.user_id = $2 AND m.status = 'invited'`,
    [clubId, userId],
  );
  return result.rows[0] ?? null;
}
