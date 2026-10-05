import { pool, type Queryable } from '../db/pool.js';

/**
 * สร้างชมรมจากคำขอที่อนุมัติ ด้วย INSERT ... SELECT (คัดลอกข้อมูลจากคำขอในคำสั่งเดียว ไม่ต้องอ่านมาที่แอปก่อน)
 * ชื่อซ้ำกับชมรมที่ยังดำเนินการอยู่จะชน unique index clubs_name_th_active_key (error code 23505)
 */
export async function insertClubFromApplication(
  applicationId: string,
  establishedOn: string,
  registeredUntil: string,
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO clubs (
       name_th, category_id, category_detail, motto, logo_meaning, logo_file_id, history, objectives,
       office_location, contact_phone, contact_email, regulation_text, established_on, registered_until
     )
     SELECT name_th, category_id, category_detail, motto, logo_meaning, logo_file_id, history, objectives,
            office_location, contact_phone, contact_email, regulation_text, $2::date, $3::date
       FROM club_applications
      WHERE id = $1
     RETURNING id`,
    [applicationId, establishedOn, registeredUntil],
  );
  return result.rows[0]!.id;
}

/**
 * ที่ปรึกษาที่ยินยอมแล้วเท่านั้น:
 * - บุคลากร: ยินยอมผ่านการ login (มี user_id)
 * - บุคคลภายนอก: แนบใบคำยินยอม และเจ้าหน้าที่ตรวจเอกสารแล้ว
 */
export async function insertAdvisorsFromApplication(
  clubId: string,
  applicationId: string,
  fiscalYear: number,
  startedOn: string,
  db: Queryable,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO club_advisors (club_id, user_id, external_person_id, fiscal_year, started_on)
     SELECT $1, user_id, external_person_id, $3, $4::date
       FROM club_application_advisors
      WHERE application_id = $2
        AND consent_status = 'accepted'
        AND (user_id IS NOT NULL OR (external_person_id IS NOT NULL AND consent_verified_at IS NOT NULL))`,
    [clubId, applicationId, fiscalYear, startedOn],
  );
  return result.rowCount ?? 0;
}

/**
 * กรรมการชุดแรกจากคำขอ พร้อมบันทึกประวัติ "รับตำแหน่ง" (actor = NULL คือระบบ) ในคำสั่งเดียว
 * ใช้ CTE: INSERT กรรมการ แล้วนำ id ที่ได้ (RETURNING) ไป INSERT ประวัติต่อ
 */
export async function insertCommitteeFromApplication(
  clubId: string,
  applicationId: string,
  startedOn: string,
  db: Queryable,
): Promise<void> {
  await db.query(
    `WITH inserted AS (
       INSERT INTO club_committee_members
         (club_id, user_id, position_id, position_title, sort_order, work_location, contact_phone, bio, started_on)
       SELECT $1, user_id, position_id, position_title, sort_order, work_location, contact_phone, bio, $3::date
         FROM club_application_committee
        WHERE application_id = $2
       RETURNING id
     )
     INSERT INTO club_committee_events (committee_member_id, actor_user_id, action, note)
     SELECT id, NULL, 'appointed', 'กรรมการชุดแรกจากการอนุมัติจัดตั้งชมรม'
       FROM inserted`,
    [clubId, applicationId, startedOn],
  );
}

/**
 * สมาชิกตั้งต้น = กรรมการ ∪ สมาชิกที่ระบุ (UNION ตัดคนซ้ำ) เฉพาะบัญชีที่ยังใช้งานได้
 * เป็นสมาชิก active ทันที (decided_by = NULL คือระบบอนุมัติพร้อมการจัดตั้ง)
 * ใช้ CTE: INSERT สมาชิก แล้วนำ id ที่ได้ (RETURNING) ไป INSERT ประวัติต่อในคำสั่งเดียว
 */
export async function insertMembershipsFromApplication(
  clubId: string,
  applicationId: string,
  db: Queryable,
): Promise<number> {
  const result = await db.query(
    `WITH inserted AS (
       INSERT INTO club_memberships (club_id, user_id, status, decided_at)
       SELECT $1, people.user_id, 'active', now()
         FROM (
           SELECT user_id FROM club_application_committee WHERE application_id = $2
           UNION
           SELECT user_id FROM club_application_members WHERE application_id = $2
         ) AS people
         JOIN users u ON u.id = people.user_id AND u.is_active
       RETURNING id
     )
     INSERT INTO club_membership_events (membership_id, actor_user_id, action, note)
     SELECT id, NULL, 'approved', 'สมาชิกตั้งต้นจากการอนุมัติจัดตั้งชมรม' FROM inserted`,
    [clubId, applicationId],
  );
  return result.rowCount ?? 0;
}

// ---------- ทำเนียบชมรม / หน้าชมรม ----------

export interface ClubListItem {
  id: string;
  nameTh: string;
  status: 'active' | 'suspended' | 'dissolved';
  category: { code: string; nameTh: string };
  motto: string | null;
  logoFileId: string | null;
  memberCount: number;
  establishedOn: string;
  registeredUntil: string;
  // สถานะของผู้ใช้ปัจจุบันในชมรมนี้ (null = ไม่ได้เป็นสมาชิก/ไม่ได้สมัคร)
  myMembershipStatus: 'pending' | 'active' | null;
  // ประธานชมรมคนปัจจุบัน (null = ยังไม่มี เช่น ประธานพ้นจากมหาวิทยาลัย)
  presidentName: string | null;
  // มีคำขอต่อทะเบียนที่ยื่นต่อสโมสรแล้ว อยู่ระหว่างตรวจ/อนุมัติ
  renewalPending: boolean;
}

export interface ClubListFilter {
  query: string | null;
  categoryCode: string | null;
  // true = เฉพาะชมรมที่ผู้ใช้เป็นสมาชิก/กรรมการ/ที่ปรึกษา
  mineOnly: boolean;
  // true = เฉพาะชมรมที่มีคำขอต่อทะเบียนยื่นแล้ว (ระหว่างต่ออายุ)
  renewingOnly: boolean;
  userId: string;
  limit: number;
  offset: number;
}

/**
 * ทำเนียบชมรมที่ยังดำเนินการอยู่ (active) ค้นจากชื่อ กรองตามประเภท แบ่งหน้า
 * - memberCount: scalar subquery นับสมาชิก active (ใช้ index club_memberships_club_id_status_idx)
 * - myMembershipStatus: สถานะใบสมัคร/สมาชิกที่ยังมีผลของผู้ใช้ (partial unique index รับประกันว่ามีไม่เกิน 1 แถว)
 * - count(*) OVER () ได้จำนวนทั้งหมดก่อน LIMIT ในคำสั่งเดียว
 */
export async function listClubs(
  filter: ClubListFilter,
  presidentPositionCode: string,
  db: Queryable = pool,
): Promise<{ items: ClubListItem[]; total: number }> {
  const pattern = filter.query ? `%${filter.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const result = await db.query<ClubListItem & { total: number }>(
    `SELECT c.id, c.name_th AS "nameTh", c.status,
            json_build_object('code', cat.code, 'nameTh', cat.name_th) AS category,
            c.motto, c.logo_file_id AS "logoFileId",
            (SELECT count(*)::int FROM club_memberships m WHERE m.club_id = c.id AND m.status = 'active') AS "memberCount",
            to_char(c.established_on, 'YYYY-MM-DD') AS "establishedOn",
            to_char(c.registered_until, 'YYYY-MM-DD') AS "registeredUntil",
            (SELECT m.status FROM club_memberships m
              WHERE m.club_id = c.id AND m.user_id = $4 AND m.status IN ('pending', 'active')) AS "myMembershipStatus",
            (SELECT u.name FROM club_committee_members cm
               JOIN club_positions p ON p.id = cm.position_id AND p.code = $8
               JOIN users u ON u.id = cm.user_id
              WHERE cm.club_id = c.id AND cm.ended_on IS NULL
              LIMIT 1) AS "presidentName",
            ren.pending AS "renewalPending",
            count(*) OVER ()::int AS total
       FROM clubs c
       JOIN club_categories cat ON cat.id = c.category_id
       -- คำขอต่อทะเบียนที่ยื่นแล้ว (ใช้ index club_applications_club_id_idx)
       CROSS JOIN LATERAL (
         SELECT EXISTS (SELECT 1 FROM club_applications a
                         WHERE a.club_id = c.id AND a.type = 'renewal' AND a.deleted_at IS NULL
                           AND a.status IN ('submitted', 'reviewed')) AS pending
       ) ren
      WHERE c.deleted_at IS NULL
        AND c.status = 'active'
        AND (NOT $7 OR ren.pending)
        AND ($1::text IS NULL OR c.name_th ILIKE $1)
        AND ($2::text IS NULL OR cat.code = $2)
        AND (NOT $3 OR EXISTS (SELECT 1 FROM club_memberships m WHERE m.club_id = c.id AND m.user_id = $4 AND m.status = 'active')
                    OR EXISTS (SELECT 1 FROM club_committee_members cm WHERE cm.club_id = c.id AND cm.user_id = $4 AND cm.ended_on IS NULL)
                    OR EXISTS (SELECT 1 FROM club_advisors a WHERE a.club_id = c.id AND a.user_id = $4 AND a.ended_on IS NULL))
      ORDER BY c.name_th
      LIMIT $5 OFFSET $6`,
    [pattern, filter.categoryCode, filter.mineOnly, filter.userId, filter.limit, filter.offset, filter.renewingOnly, presidentPositionCode],
  );
  return {
    items: result.rows.map(({ total: _total, ...item }) => item),
    total: result.rows[0]?.total ?? 0,
  };
}

export interface ClubDetailRow {
  id: string;
  nameTh: string;
  status: 'active' | 'suspended' | 'dissolved';
  category: { code: string; nameTh: string };
  categoryDetail: string | null;
  motto: string | null;
  logoMeaning: string | null;
  logoFileId: string | null;
  history: string | null;
  objectives: string[];
  officeLocation: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  regulationText: string | null;
  establishedOn: string;
  registeredUntil: string;
  memberCount: number;
}

export async function findClubDetail(clubId: string, db: Queryable = pool): Promise<ClubDetailRow | null> {
  const result = await db.query<ClubDetailRow>(
    `SELECT c.id, c.name_th AS "nameTh", c.status,
            json_build_object('code', cat.code, 'nameTh', cat.name_th) AS category,
            c.category_detail AS "categoryDetail", c.motto, c.logo_meaning AS "logoMeaning",
            c.logo_file_id AS "logoFileId", c.history, c.objectives,
            c.office_location AS "officeLocation", c.contact_phone AS "contactPhone", c.contact_email AS "contactEmail",
            c.regulation_text AS "regulationText",
            to_char(c.established_on, 'YYYY-MM-DD') AS "establishedOn",
            to_char(c.registered_until, 'YYYY-MM-DD') AS "registeredUntil",
            (SELECT count(*)::int FROM club_memberships m WHERE m.club_id = c.id AND m.status = 'active') AS "memberCount"
       FROM clubs c
       JOIN club_categories cat ON cat.id = c.category_id
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [clubId],
  );
  return result.rows[0] ?? null;
}

export interface ClubCommitteeRow {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  positionCode: string;
  positionTitle: string;
  contactPhone: string | null;
  workLocation: string | null;
  startedOn: string;
  // ชื่อพร้อมคำนำหน้าสำหรับเอกสารพิมพ์
  formalName: string;
}

// กรรมการชุดปัจจุบัน (ยังไม่สิ้นสุดตำแหน่ง) เรียงตามลำดับที่กำหนด ใช้ partial index club_committee_members_current_idx
export async function listCurrentCommittee(clubId: string, db: Queryable = pool): Promise<ClubCommitteeRow[]> {
  const result = await db.query<ClubCommitteeRow>(
    `SELECT cm.id, cm.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName", user_formal_name(cm.user_id) AS "formalName",
            p.code AS "positionCode", cm.position_title AS "positionTitle",
            cm.contact_phone AS "contactPhone", cm.work_location AS "workLocation",
            to_char(cm.started_on, 'YYYY-MM-DD') AS "startedOn"
       FROM club_committee_members cm
       JOIN users u ON u.id = cm.user_id
       JOIN club_positions p ON p.id = cm.position_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE cm.club_id = $1 AND cm.ended_on IS NULL
      ORDER BY p.sort_order, cm.sort_order
      LIMIT 200`,
    [clubId],
  );
  return result.rows;
}

export interface ClubAdvisorRow {
  kind: 'internal' | 'external';
  name: string;
  organization: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  userId: string | null;
}

// ที่ปรึกษาปัจจุบัน: บุคลากร (users) หรือบุคคลภายนอก (external_persons) — LEFT JOIN ทั้งสองแล้วเลือกค่าที่มี
export async function listCurrentAdvisors(clubId: string, db: Queryable = pool): Promise<ClubAdvisorRow[]> {
  const result = await db.query<ClubAdvisorRow>(
    `SELECT CASE WHEN a.external_person_id IS NULL THEN 'internal' ELSE 'external' END AS kind,
            COALESCE(u.name, u.email, concat(e.prefix_th, e.first_name_th, ' ', e.last_name_th)) AS name,
            COALESCE(ou.name_th, e.organization) AS organization,
            e.position, COALESCE(u.email, e.email) AS email, e.phone, a.user_id AS "userId"
       FROM club_advisors a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
       LEFT JOIN external_persons e ON e.id = a.external_person_id
      WHERE a.club_id = $1 AND a.ended_on IS NULL
      ORDER BY a.created_at
      LIMIT 10`,
    [clubId],
  );
  return result.rows;
}

export interface ClubMemberRow {
  membershipId: string;
  isCommittee: boolean;
  userId: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
  joinedAt: Date | null;
  // ชื่อพร้อมคำนำหน้าสำหรับเอกสารพิมพ์
  formalName: string;
}

// รายชื่อสมาชิก active (ข้อมูลภายใน) แบ่งหน้า
export async function listActiveMembers(
  clubId: string,
  limit: number,
  offset: number,
  db: Queryable = pool,
): Promise<{ items: ClubMemberRow[]; total: number }> {
  const result = await db.query<ClubMemberRow & { total: number }>(
    `SELECT m.id AS "membershipId", m.user_id AS "userId", u.name, u.email, ou.name_th AS "orgUnitName", user_formal_name(m.user_id) AS "formalName",
            m.decided_at AS "joinedAt",
            EXISTS (SELECT 1 FROM club_committee_members cm
                     WHERE cm.club_id = m.club_id AND cm.user_id = m.user_id AND cm.ended_on IS NULL) AS "isCommittee",
            count(*) OVER ()::int AS total
       FROM club_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE m.club_id = $1 AND m.status = 'active'
      ORDER BY u.name NULLS LAST, u.email
      LIMIT $2 OFFSET $3`,
    [clubId, limit, offset],
  );
  return { items: result.rows.map(({ total: _total, ...row }) => row), total: result.rows[0]?.total ?? 0 };
}

// สถานะสมาชิกที่ยังมีผลของผู้ใช้ในชมรม (pending/active) หรือ null
export async function findCurrentMembershipStatus(
  clubId: string,
  userId: string,
  db: Queryable = pool,
): Promise<'pending' | 'active' | null> {
  const result = await db.query<{ status: 'pending' | 'active' }>(
    `SELECT status FROM club_memberships WHERE club_id = $1 AND user_id = $2 AND status IN ('pending', 'active')`,
    [clubId, userId],
  );
  return result.rows[0]?.status ?? null;
}

// ตราสัญลักษณ์ของชมรม (null ตัวนอก = ไม่พบชมรม)
export async function findClubLogoFileId(clubId: string, db: Queryable = pool): Promise<{ logoFileId: string | null } | null> {
  const result = await db.query<{ logoFileId: string | null }>(
    'SELECT logo_file_id AS "logoFileId" FROM clubs WHERE id = $1 AND deleted_at IS NULL',
    [clubId],
  );
  return result.rows[0] ?? null;
}

/**
 * เปลี่ยนตราของชมรม แล้วคืนค่าไฟล์เดิม (เพื่อลบถ้าไม่มีใครใช้แล้ว)
 * subquery "old" ล็อกแถว (FOR UPDATE) และอ่านค่าเดิมก่อน UPDATE เพราะ RETURNING ปกติเห็นเฉพาะค่าใหม่
 */
export async function replaceClubLogo(clubId: string, fileId: string | null, db: Queryable): Promise<{ previousFileId: string | null } | null> {
  const result = await db.query<{ previousFileId: string | null }>(
    `UPDATE clubs c SET logo_file_id = $2
       FROM (SELECT id, logo_file_id FROM clubs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE) old
      WHERE c.id = old.id
      RETURNING old.logo_file_id AS "previousFileId"`,
    [clubId, fileId],
  );
  return result.rows[0] ?? null;
}

/**
 * แผนกิจกรรมในคำขอ → แผนประจำปีของชมรม (created_by = NULL คือระบบคัดลอก)
 * ON CONFLICT: คำขอเดียวกันคัดลอกซ้ำไม่ได้ (unique application_activity_id)
 */
export async function insertPlannedActivitiesFromApplication(
  clubId: string,
  applicationId: string,
  fiscalYear: number,
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO club_planned_activities
       (club_id, fiscal_year, planned_date, planned_time, title, note, sort_order, application_activity_id)
     SELECT $1, $3, activity_date, activity_time, title, note, sort_order, id
       FROM club_application_activities
      WHERE application_id = $2
     ON CONFLICT (application_activity_id) DO NOTHING`,
    [clubId, applicationId, fiscalYear],
  );
}

// ---------- ชมรมที่อยู่ระหว่างขอจัดตั้ง (คำขอจัดตั้งที่ยื่นต่อสโมสรแล้ว) ----------

// สถานะคำขอจัดตั้งที่แสดงในทำเนียบ: ยื่นแล้วรอตรวจ / ตรวจผ่านรออนุมัติ (ร่างและรอการตอบรับยังเป็นงานภายในของผู้ยื่น)
export const PROPOSED_CLUB_STATUSES = ['submitted', 'reviewed'] as const;

export interface ProposedClubItem {
  id: string;
  nameTh: string;
  status: 'submitted' | 'reviewed';
  category: { code: string; nameTh: string } | null;
  motto: string | null;
  logoFileId: string | null;
  presidentName: string | null;
  submittedAt: Date | null;
}

const PROPOSED_COLUMNS = `
  a.id, a.name_th AS "nameTh", a.status,
  CASE WHEN cat.id IS NULL THEN NULL ELSE json_build_object('code', cat.code, 'nameTh', cat.name_th) END AS category,
  a.motto, a.logo_file_id AS "logoFileId",
  (SELECT u.name FROM club_application_committee m
     JOIN club_positions p ON p.id = m.position_id AND p.code = $1
     JOIN users u ON u.id = m.user_id
    WHERE m.application_id = a.id LIMIT 1) AS "presidentName",
  a.submitted_at AS "submittedAt"`;

/**
 * คำขอจัดตั้งที่ยื่นต่อสโมสรแล้ว ค้นชื่อ/กรองประเภท แบ่งหน้า (ใช้ index club_applications_status_idx)
 * เฉพาะข้อมูลแนะนำชมรม (ไม่มีข้อมูลติดต่อ/รายชื่อสมาชิก)
 */
export async function listProposedClubs(
  filter: { query: string | null; categoryCode: string | null; limit: number; offset: number },
  presidentPositionCode: string,
  db: Queryable = pool,
): Promise<{ items: ProposedClubItem[]; total: number }> {
  const pattern = filter.query ? `%${filter.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const result = await db.query<ProposedClubItem & { total: number }>(
    `SELECT ${PROPOSED_COLUMNS}, count(*) OVER ()::int AS total
       FROM club_applications a
       LEFT JOIN club_categories cat ON cat.id = a.category_id
      WHERE a.type = 'establish' AND a.deleted_at IS NULL AND a.status = ANY($2::text[])
        AND ($3::text IS NULL OR a.name_th ILIKE $3)
        AND ($4::text IS NULL OR cat.code = $4)
      ORDER BY a.submitted_at DESC NULLS LAST, a.id
      LIMIT $5 OFFSET $6`,
    [presidentPositionCode, PROPOSED_CLUB_STATUSES, pattern, filter.categoryCode, filter.limit, filter.offset],
  );
  return { items: result.rows.map(({ total: _total, ...item }) => item), total: result.rows[0]?.total ?? 0 };
}

export interface ProposedClubDetail extends ProposedClubItem {
  categoryDetail: string | null;
  objectives: string[];
  logoMeaning: string | null;
  fiscalYear: number;
  presidentOrgUnit: string | null;
}

// หน้าสรุปสาธารณะของคำขอจัดตั้งที่ยื่นแล้ว (null = ไม่พบ หรือไม่อยู่ในสถานะที่เปิดเผย)
export async function findProposedClub(id: string, presidentPositionCode: string, db: Queryable = pool): Promise<ProposedClubDetail | null> {
  const result = await db.query<ProposedClubDetail>(
    `SELECT ${PROPOSED_COLUMNS},
            a.category_detail AS "categoryDetail", a.objectives, a.logo_meaning AS "logoMeaning", a.fiscal_year AS "fiscalYear",
            (SELECT ou.name_th FROM club_application_committee m
               JOIN club_positions p ON p.id = m.position_id AND p.code = $1
               JOIN staff_profiles sp ON sp.user_id = m.user_id
               JOIN org_units ou ON ou.id = sp.org_unit_id
              WHERE m.application_id = a.id LIMIT 1) AS "presidentOrgUnit"
       FROM club_applications a
       LEFT JOIN club_categories cat ON cat.id = a.category_id
      WHERE a.id = $2 AND a.type = 'establish' AND a.deleted_at IS NULL AND a.status = ANY($3::text[])`,
    [presidentPositionCode, id, PROPOSED_CLUB_STATUSES],
  );
  return result.rows[0] ?? null;
}
