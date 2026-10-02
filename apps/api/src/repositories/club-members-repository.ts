import { pool, type Queryable } from '../db/pool.js';
import type { MembershipEndReason, MembershipStatus } from './memberships-repository.js';

// รายชื่อและข้อมูลรายบุคคลของสมาชิกชมรม สำหรับกรรมการ (ข้อมูลภายใน — ตรวจสิทธิ์ที่ route/service)

export interface MemberSearchFilter {
  clubId: string;
  // ค้นชื่อ/อีเมล/หน่วยงาน
  query: string | null;
  // active = สมาชิกปัจจุบัน, ended = พ้นสภาพแล้ว, all = ทั้งสองแบบ (ใบสมัครดูที่รายการใบสมัคร)
  // deleted = รายการที่กรรมการลบ (เฉพาะผู้มีสิทธิ์ดูรายการที่ลบ — ตรวจที่ service)
  status: 'active' | 'ended' | 'all' | 'deleted';
  // committee = เฉพาะกรรมการปัจจุบัน, member = เฉพาะสมาชิกที่ไม่ใช่กรรมการ
  role: 'committee' | 'member' | null;
  limit: number;
  offset: number;
}

export interface MemberListRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  status: MembershipStatus;
  joinedAt: Date | null;
  endedOn: string | null;
  endReason: MembershipEndReason | null;
  isCommittee: boolean;
  positionTitle: string | null;
  // ยื่นลาออกแล้ว รอมีผล
  resignRequestedAt: Date | null;
  // เฉพาะรายการที่ลบ
  deletedAt: Date | null;
  deletedByName: string | null;
  statusBeforeDelete: MembershipStatus | null;
}

const escapeLike = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * ค้นหา/กรองรายชื่อสมาชิก แบ่งหน้า
 * - cm (LATERAL): ตำแหน่งกรรมการปัจจุบันของคนนั้นในชมรมนี้ (1 คน 1 ตำแหน่ง) ใช้ทั้งแสดงและกรองบทบาท
 * - สมาชิกที่พ้นสภาพแล้วอาจมีหลายแถวในประวัติ (เคยออกแล้วกลับมาใหม่) แสดงทุกแถวตามจริง
 * - count(*) OVER () ได้จำนวนทั้งหมดก่อน LIMIT ในคำสั่งเดียว
 */
export async function searchClubMembers(
  filter: MemberSearchFilter,
  db: Queryable = pool,
): Promise<{ items: MemberListRow[]; total: number }> {
  const statuses = filter.status === 'all' ? ['active', 'ended'] : [filter.status];
  // รายการที่ลบ เรียงจากลบล่าสุด ส่วนอื่นเรียงตามชื่อ
  const result = await db.query<MemberListRow & { total: number }>(
    `SELECT m.id AS "membershipId", m.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName",
            m.status, m.decided_at AS "joinedAt", to_char(m.ended_on, 'YYYY-MM-DD') AS "endedOn", m.end_reason AS "endReason",
            (cm.position_title IS NOT NULL AND m.status = 'active') AS "isCommittee",
            CASE WHEN m.status = 'active' THEN cm.position_title END AS "positionTitle",
            m.resign_requested_at AS "resignRequestedAt",
            m.deleted_at AS "deletedAt", du.name AS "deletedByName", m.status_before_delete AS "statusBeforeDelete",
            count(*) OVER ()::int AS total
       FROM club_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN users du ON du.id = m.deleted_by
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
       LEFT JOIN LATERAL (
         SELECT c.position_title FROM club_committee_members c
          WHERE c.club_id = m.club_id AND c.user_id = m.user_id AND c.ended_on IS NULL
          LIMIT 1
       ) cm ON true
      WHERE m.club_id = $1
        AND m.status = ANY($2::text[])
        AND ($3::text IS NULL OR u.name ILIKE $3 OR u.email ILIKE $3 OR ou.name_th ILIKE $3)
        AND ($4::text IS NULL
             OR ($4 = 'committee' AND cm.position_title IS NOT NULL AND m.status = 'active')
             OR ($4 = 'member' AND (cm.position_title IS NULL OR m.status <> 'active')))
      ORDER BY m.deleted_at DESC NULLS LAST, (m.status = 'active') DESC, u.name NULLS LAST, u.email, m.applied_at DESC
      LIMIT $5 OFFSET $6`,
    [filter.clubId, statuses, filter.query ? escapeLike(filter.query) : null, filter.role, filter.limit, filter.offset],
  );
  return { items: result.rows.map(({ total: _total, ...row }) => row), total: result.rows[0]?.total ?? 0 };
}

export interface MemberPerson {
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  // สมาชิกภาพล่าสุดในชมรมนี้ (null = ไม่เคยสมัคร/เป็นสมาชิก)
  membershipId: string | null;
  status: MembershipStatus | null;
  appliedAt: Date | null;
  joinedAt: Date | null;
  endedOn: string | null;
  endReason: MembershipEndReason | null;
}

// ข้อมูลผู้ใช้ + สมาชิกภาพล่าสุดในชมรมนี้ (null = ไม่พบผู้ใช้)
// includeDeleted = false: ไม่นับแถวที่ถูกลบ (ผู้ที่มีแต่แถวที่ถูกลบ = ไม่พบในชมรม)
export async function findMemberPerson(
  clubId: string,
  userId: string,
  includeDeleted = false,
  db: Queryable = pool,
): Promise<MemberPerson | null> {
  const result = await db.query<MemberPerson>(
    `SELECT u.id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName",
            m.id AS "membershipId", m.status, m.applied_at AS "appliedAt", m.decided_at AS "joinedAt",
            to_char(m.ended_on, 'YYYY-MM-DD') AS "endedOn", m.end_reason AS "endReason"
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
       LEFT JOIN LATERAL (
         SELECT id, status, applied_at, decided_at, ended_on, end_reason FROM club_memberships
          WHERE club_id = $1 AND user_id = u.id AND ($3 OR status <> 'deleted')
          ORDER BY applied_at DESC
          LIMIT 1
       ) m ON true
      WHERE u.id = $2`,
    [clubId, userId, includeDeleted],
  );
  return result.rows[0] ?? null;
}

export interface MembershipHistoryRow {
  action: string;
  note: string | null;
  actorName: string | null;
  createdAt: Date;
}

// ประวัติสมาชิกภาพทุกครั้งของผู้ใช้ในชมรมนี้ (ใหม่สุดก่อน)
// includeDeleted = false: ไม่แสดงประวัติของแถวที่ถูกลบ (รายการที่บันทึกผิด)
export async function listMembershipHistory(
  clubId: string,
  userId: string,
  includeDeleted = false,
  db: Queryable = pool,
): Promise<MembershipHistoryRow[]> {
  const result = await db.query<MembershipHistoryRow>(
    `SELECT e.action, e.note, a.name AS "actorName", e.created_at AS "createdAt"
       FROM club_membership_events e
       JOIN club_memberships m ON m.id = e.membership_id
       LEFT JOIN users a ON a.id = e.actor_user_id
      WHERE m.club_id = $1 AND m.user_id = $2 AND ($3 OR m.status <> 'deleted')
      ORDER BY e.created_at DESC
      LIMIT 100`,
    [clubId, userId, includeDeleted],
  );
  return result.rows;
}

export interface MemberPositionRow {
  positionTitle: string;
  startedOn: string;
  endedOn: string | null;
}

// ตำแหน่งกรรมการในชมรมนี้ (ปัจจุบันและที่ผ่านมา)
export async function listMemberPositions(clubId: string, userId: string, db: Queryable = pool): Promise<MemberPositionRow[]> {
  const result = await db.query<MemberPositionRow>(
    `SELECT position_title AS "positionTitle", to_char(started_on, 'YYYY-MM-DD') AS "startedOn",
            to_char(ended_on, 'YYYY-MM-DD') AS "endedOn"
       FROM club_committee_members
      WHERE club_id = $1 AND user_id = $2
      ORDER BY started_on DESC
      LIMIT 50`,
    [clubId, userId],
  );
  return result.rows;
}

export interface MemberAchievementRow {
  id: string;
  title: string;
  achievedOn: string;
  level: string;
  category: string;
  award: string | null;
  status: string;
}

// ผลงานที่บันทึกในชมรมนี้เท่านั้น (ไม่รวมผลงานในชมรมอื่นของคนเดียวกัน)
export async function listMemberAchievements(clubId: string, userId: string, db: Queryable = pool): Promise<MemberAchievementRow[]> {
  const result = await db.query<MemberAchievementRow>(
    `SELECT id, title, to_char(achieved_on, 'YYYY-MM-DD') AS "achievedOn", level, category, award, status
       FROM club_achievements
      WHERE club_id = $1 AND user_id = $2
      ORDER BY achieved_on DESC
      LIMIT 100`,
    [clubId, userId],
  );
  return result.rows;
}

export interface MemberActivityRow {
  id: string;
  title: string;
  heldOn: string;
}

// กิจกรรมของชมรมนี้ที่เข้าร่วม (ล่าสุด 50 รายการ) + จำนวนทั้งหมด
export async function listMemberActivities(
  clubId: string,
  userId: string,
  db: Queryable = pool,
): Promise<{ items: MemberActivityRow[]; total: number }> {
  const result = await db.query<MemberActivityRow & { total: number }>(
    `SELECT a.id, a.title, to_char(a.held_on, 'YYYY-MM-DD') AS "heldOn", count(*) OVER ()::int AS total
       FROM club_activity_participants p
       JOIN club_activities a ON a.id = p.activity_id AND a.deleted_at IS NULL
      WHERE a.club_id = $1 AND p.user_id = $2
      ORDER BY a.held_on DESC
      LIMIT 50`,
    [clubId, userId],
  );
  return { items: result.rows.map(({ total: _total, ...row }) => row), total: result.rows[0]?.total ?? 0 };
}

export interface MemberCompetitionRow {
  competitionId: string;
  title: string;
  sportName: string;
  heldFrom: string;
  rank: number | null;
  medal: string | null;
}

// ผลการแข่งขันในนามชมรมนี้ (ชมรมกีฬา)
export async function listMemberCompetitionResults(clubId: string, userId: string, db: Queryable = pool): Promise<MemberCompetitionRow[]> {
  const result = await db.query<MemberCompetitionRow>(
    `SELECT c.id AS "competitionId", c.title, s.name_th AS "sportName", to_char(c.held_from, 'YYYY-MM-DD') AS "heldFrom",
            r.rank, r.medal
       FROM sport_competition_results r
       JOIN sport_competitions c ON c.id = r.competition_id AND c.deleted_at IS NULL
       JOIN sports s ON s.id = c.sport_id
      WHERE c.club_id = $1 AND r.user_id = $2
      ORDER BY c.held_from DESC
      LIMIT 50`,
    [clubId, userId],
  );
  return result.rows;
}

// ---------- ส่งออก ----------

// จำนวนแถวสูงสุดที่ส่งออกได้ต่อครั้ง (ชมรมบุคลากรมีสมาชิกไม่ถึงหลักพัน)
export const MEMBER_EXPORT_LIMIT = 5000;

// บันทึกการส่งออก (ไม่เก็บรายชื่อ เก็บเฉพาะตัวกรองและจำนวนแถว)
export async function insertMemberExportLog(
  input: { clubId: string; exportedBy: string; filter: Record<string, string | null>; rowCount: number },
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `INSERT INTO club_member_exports (club_id, exported_by, filter, row_count) VALUES ($1, $2, $3, $4)`,
    [input.clubId, input.exportedBy, JSON.stringify(input.filter), input.rowCount],
  );
}

// ---------- ข้อมูลที่ผูกกับสมาชิกในชมรม (ใช้ตัดสินว่าลบรายชื่อได้หรือไม่) ----------

/**
 * มีข้อมูลของผู้ใช้ผูกกับชมรมนี้หรือไม่: ผลงาน, การเข้าร่วมกิจกรรม, ประวัตินักกีฬา, ผลการแข่งขัน, ตำแหน่งกรรมการ (ทุกช่วงเวลา)
 * มี = เป็นสมาชิกจริง ต้องใช้ "ให้พ้นสภาพ" แทนการลบ
 */
export async function hasMemberRecords(clubId: string, userId: string, db: Queryable = pool): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM club_achievements WHERE club_id = $1 AND user_id = $2)
         OR EXISTS (SELECT 1 FROM club_activity_participants p
                      JOIN club_activities a ON a.id = p.activity_id AND a.deleted_at IS NULL
                     WHERE a.club_id = $1 AND p.user_id = $2)
         OR EXISTS (SELECT 1 FROM club_athletes WHERE club_id = $1 AND user_id = $2)
         OR EXISTS (SELECT 1 FROM sport_competition_results r
                      JOIN sport_competitions c ON c.id = r.competition_id AND c.deleted_at IS NULL
                     WHERE c.club_id = $1 AND r.user_id = $2)
         OR EXISTS (SELECT 1 FROM club_committee_members WHERE club_id = $1 AND user_id = $2) AS "exists"`,
    [clubId, userId],
  );
  return result.rows[0]?.exists ?? false;
}
