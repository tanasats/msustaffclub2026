import { pool, type Queryable } from '../db/pool.js';

export type ApplicationType = 'establish' | 'renewal';
export type ApplicationStatus =
  | 'draft'
  | 'awaiting_consent'
  | 'submitted'
  | 'returned'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface ApplicationBase {
  id: string;
  type: ApplicationType;
  clubId: string | null;
  fiscalYear: number;
  status: ApplicationStatus;
  applicantUserId: string;
  nameTh: string;
  regulationText: string | null;
}

const BASE_COLUMNS = `
  id, type, club_id AS "clubId", fiscal_year AS "fiscalYear", status,
  applicant_user_id AS "applicantUserId", name_th AS "nameTh", regulation_text AS "regulationText"`;

export interface NewApplication {
  type: ApplicationType;
  clubId: string | null;
  fiscalYear: number;
  applicantUserId: string;
  nameTh: string;
  regulationText: string | null;
}

export async function insertApplication(input: NewApplication, db: Queryable = pool): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_applications (type, club_id, fiscal_year, applicant_user_id, name_th, regulation_text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.type, input.clubId, input.fiscalYear, input.applicantUserId, input.nameTh, input.regulationText],
  );
  return result.rows[0]!.id;
}

export async function findApplicationBase(id: string, db: Queryable = pool): Promise<ApplicationBase | null> {
  const result = await db.query<ApplicationBase>(
    `SELECT ${BASE_COLUMNS} FROM club_applications WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * อ่านคำขอพร้อมล็อกแถว (FOR UPDATE) จนจบ transaction
 * ใช้ก่อนแก้ไขทุกครั้ง เพื่อไม่ให้การแก้ไข 2 คำสั่งพร้อมกัน หรือการแก้ไขระหว่างเปลี่ยนสถานะ ทับกัน
 */
export async function lockApplication(id: string, db: Queryable): Promise<ApplicationBase | null> {
  const result = await db.query<ApplicationBase>(
    `SELECT ${BASE_COLUMNS} FROM club_applications WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface ApplicationGeneralFields {
  nameTh?: string;
  categoryId?: string | null;
  categoryDetail?: string | null;
  history?: string | null;
  motto?: string | null;
  logoMeaning?: string | null;
  objectives?: string[];
  officeLocation?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  regulationText?: string | null;
}

/**
 * แก้เฉพาะฟิลด์ที่ส่งมา (PATCH)
 * ใช้ CASE WHEN $n THEN ค่าใหม่ ELSE ค่าเดิม END ต่อคอลัมน์: $n (boolean) บอกว่าฟิลด์นั้นถูกส่งมาหรือไม่
 * ทำให้ SQL คงที่ ไม่ต้องต่อสตริง SQL ตามฟิลด์ที่ส่งมา และแยก "ไม่ส่ง" กับ "ส่ง null (ล้างค่า)" ได้
 */
export async function updateApplicationGeneral(
  id: string,
  fields: ApplicationGeneralFields,
  db: Queryable = pool,
): Promise<void> {
  const has = (key: keyof ApplicationGeneralFields) => fields[key] !== undefined;
  await db.query(
    `UPDATE club_applications
        SET name_th         = CASE WHEN $2  THEN $3  ELSE name_th END,
            category_id     = CASE WHEN $4  THEN $5::uuid ELSE category_id END,
            category_detail = CASE WHEN $6  THEN $7  ELSE category_detail END,
            history         = CASE WHEN $8  THEN $9  ELSE history END,
            motto           = CASE WHEN $10 THEN $11 ELSE motto END,
            logo_meaning    = CASE WHEN $12 THEN $13 ELSE logo_meaning END,
            objectives      = CASE WHEN $14 THEN $15::text[] ELSE objectives END,
            office_location = CASE WHEN $16 THEN $17 ELSE office_location END,
            contact_phone   = CASE WHEN $18 THEN $19 ELSE contact_phone END,
            contact_email   = CASE WHEN $20 THEN $21 ELSE contact_email END,
            regulation_text = CASE WHEN $22 THEN $23 ELSE regulation_text END
      WHERE id = $1`,
    [
      id,
      has('nameTh'), fields.nameTh ?? null,
      has('categoryId'), fields.categoryId ?? null,
      has('categoryDetail'), fields.categoryDetail ?? null,
      has('history'), fields.history ?? null,
      has('motto'), fields.motto ?? null,
      has('logoMeaning'), fields.logoMeaning ?? null,
      has('objectives'), fields.objectives ?? [],
      has('officeLocation'), fields.officeLocation ?? null,
      has('contactPhone'), fields.contactPhone ?? null,
      has('contactEmail'), fields.contactEmail ?? null,
      has('regulationText'), fields.regulationText ?? null,
    ],
  );
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus, db: Queryable): Promise<void> {
  await db.query('UPDATE club_applications SET status = $2 WHERE id = $1', [id, status]);
}

// ---------- ที่ปรึกษา ----------

export interface AdvisorRow {
  email: string;
  userId: string | null;
  sortOrder: number;
  consentStatus: 'pending' | 'accepted' | 'declined';
  respondedAt: Date | null;
}

export async function listAdvisorRows(applicationId: string, db: Queryable = pool): Promise<AdvisorRow[]> {
  const result = await db.query<AdvisorRow>(
    `SELECT email, user_id AS "userId", sort_order AS "sortOrder",
            consent_status AS "consentStatus", responded_at AS "respondedAt"
       FROM club_application_advisors
      WHERE application_id = $1
      ORDER BY sort_order
      LIMIT 10`,
    [applicationId],
  );
  return result.rows;
}

/**
 * แทนที่รายชื่อที่ปรึกษาทั้งชุด: ลบของเดิมแล้วใส่ใหม่ (ใน transaction ของผู้เรียก)
 * unnest() กระจาย array หลายตัวเป็นหลายแถวพร้อมกัน จึง INSERT ทั้งชุดได้ในคำสั่งเดียว
 */
export async function replaceAdvisorRows(applicationId: string, rows: AdvisorRow[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_application_advisors WHERE application_id = $1', [applicationId]);
  if (rows.length === 0) return;
  await db.query(
    `INSERT INTO club_application_advisors (application_id, email, user_id, sort_order, consent_status, responded_at)
     SELECT $1, t.email, t.user_id, t.sort_order, t.consent_status, t.responded_at
       FROM unnest($2::text[], $3::uuid[], $4::smallint[], $5::text[], $6::timestamptz[])
            AS t (email, user_id, sort_order, consent_status, responded_at)`,
    [
      applicationId,
      rows.map((row) => row.email),
      rows.map((row) => row.userId),
      rows.map((row) => row.sortOrder),
      rows.map((row) => row.consentStatus),
      rows.map((row) => row.respondedAt),
    ],
  );
}

// ---------- กรรมการ ----------

export interface CommitteeRowInput {
  userId: string;
  positionId: string;
  positionTitle: string;
  sortOrder: number;
  workLocation: string | null;
  contactPhone: string | null;
  bio: string | null;
}

export async function replaceCommitteeRows(applicationId: string, rows: CommitteeRowInput[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_application_committee WHERE application_id = $1', [applicationId]);
  if (rows.length === 0) return;
  await db.query(
    `INSERT INTO club_application_committee
       (application_id, user_id, position_id, position_title, sort_order, work_location, contact_phone, bio)
     SELECT $1, t.user_id, t.position_id, t.position_title, t.sort_order, t.work_location, t.contact_phone, t.bio
       FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[])
            AS t (user_id, position_id, position_title, sort_order, work_location, contact_phone, bio)`,
    [
      applicationId,
      rows.map((row) => row.userId),
      rows.map((row) => row.positionId),
      rows.map((row) => row.positionTitle),
      rows.map((row) => row.sortOrder),
      rows.map((row) => row.workLocation),
      rows.map((row) => row.contactPhone),
      rows.map((row) => row.bio),
    ],
  );
}

// ---------- สมาชิก ----------

export async function replaceMemberRows(applicationId: string, userIds: string[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_application_members WHERE application_id = $1', [applicationId]);
  if (userIds.length === 0) return;
  await db.query(
    `INSERT INTO club_application_members (application_id, user_id)
     SELECT $1, unnest($2::uuid[])`,
    [applicationId, userIds],
  );
}

// ---------- แผนกิจกรรม ----------

export interface ActivityRowInput {
  activityDate: string | null;
  activityTime: string | null;
  title: string;
  note: string | null;
  sortOrder: number;
}

export async function replaceActivityRows(applicationId: string, rows: ActivityRowInput[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM club_application_activities WHERE application_id = $1', [applicationId]);
  if (rows.length === 0) return;
  await db.query(
    `INSERT INTO club_application_activities (application_id, activity_date, activity_time, title, note, sort_order)
     SELECT $1, t.activity_date, t.activity_time, t.title, t.note, t.sort_order
       FROM unnest($2::date[], $3::text[], $4::text[], $5::text[], $6::int[])
            AS t (activity_date, activity_time, title, note, sort_order)`,
    [
      applicationId,
      rows.map((row) => row.activityDate),
      rows.map((row) => row.activityTime),
      rows.map((row) => row.title),
      rows.map((row) => row.note),
      rows.map((row) => row.sortOrder),
    ],
  );
}

// ---------- log สถานะ ----------

export interface NewApplicationEvent {
  applicationId: string;
  actorUserId: string | null;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  note: string | null;
}

export async function insertApplicationEvent(input: NewApplicationEvent, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO club_application_events (application_id, actor_user_id, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.applicationId, input.actorUserId, input.fromStatus, input.toStatus, input.note],
  );
}

// ---------- อ่านรายละเอียด ----------

export interface ApplicationDetailRow extends ApplicationBase {
  applicantName: string | null;
  applicantEmail: string;
  categoryId: string | null;
  categoryCode: string | null;
  categoryNameTh: string | null;
  categoryRequiresDetail: boolean | null;
  categoryDetail: string | null;
  history: string | null;
  motto: string | null;
  logoMeaning: string | null;
  objectives: string[];
  officeLocation: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function findApplicationDetail(id: string, db: Queryable = pool): Promise<ApplicationDetailRow | null> {
  // LEFT JOIN ประเภท เพราะฉบับร่างอาจยังไม่เลือกประเภท
  const result = await db.query<ApplicationDetailRow>(
    `SELECT a.id, a.type, a.club_id AS "clubId", a.fiscal_year AS "fiscalYear", a.status,
            a.applicant_user_id AS "applicantUserId", u.name AS "applicantName", u.email AS "applicantEmail",
            a.name_th AS "nameTh",
            a.category_id AS "categoryId", c.code AS "categoryCode", c.name_th AS "categoryNameTh",
            c.requires_detail AS "categoryRequiresDetail", a.category_detail AS "categoryDetail",
            a.history, a.motto, a.logo_meaning AS "logoMeaning", a.objectives,
            a.office_location AS "officeLocation", a.contact_phone AS "contactPhone", a.contact_email AS "contactEmail",
            a.regulation_text AS "regulationText",
            a.submitted_at AS "submittedAt", a.reviewed_at AS "reviewedAt", a.decided_at AS "decidedAt",
            a.decision_note AS "decisionNote", a.created_at AS "createdAt", a.updated_at AS "updatedAt"
       FROM club_applications a
       JOIN users u ON u.id = a.applicant_user_id
       LEFT JOIN club_categories c ON c.id = a.category_id
      WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface AdvisorDetailRow extends AdvisorRow {
  userName: string | null;
}

export async function listAdvisorDetails(applicationId: string, db: Queryable = pool): Promise<AdvisorDetailRow[]> {
  const result = await db.query<AdvisorDetailRow>(
    `SELECT a.email, a.user_id AS "userId", u.name AS "userName", a.sort_order AS "sortOrder",
            a.consent_status AS "consentStatus", a.responded_at AS "respondedAt"
       FROM club_application_advisors a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.application_id = $1
      ORDER BY a.sort_order
      LIMIT 10`,
    [applicationId],
  );
  return result.rows;
}

export interface CommitteeDetailRow {
  userId: string;
  userName: string | null;
  userEmail: string;
  userIsActive: boolean;
  orgUnitName: string | null;
  positionId: string;
  positionCode: string;
  positionNameTh: string;
  positionTitle: string;
  sortOrder: number;
  workLocation: string | null;
  contactPhone: string | null;
  bio: string | null;
}

export async function listCommitteeDetails(applicationId: string, db: Queryable = pool): Promise<CommitteeDetailRow[]> {
  const result = await db.query<CommitteeDetailRow>(
    `SELECT m.user_id AS "userId", u.name AS "userName", u.email AS "userEmail", u.is_active AS "userIsActive",
            ou.name_th AS "orgUnitName",
            p.id AS "positionId", p.code AS "positionCode", p.name_th AS "positionNameTh",
            m.position_title AS "positionTitle", m.sort_order AS "sortOrder",
            m.work_location AS "workLocation", m.contact_phone AS "contactPhone", m.bio
       FROM club_application_committee m
       JOIN users u ON u.id = m.user_id
       JOIN club_positions p ON p.id = m.position_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE m.application_id = $1
      ORDER BY m.sort_order, p.sort_order
      LIMIT 200`,
    [applicationId],
  );
  return result.rows;
}

export interface MemberDetailRow {
  userId: string;
  userName: string | null;
  userEmail: string;
  userIsActive: boolean;
  orgUnitName: string | null;
}

export async function listMemberDetails(applicationId: string, db: Queryable = pool): Promise<MemberDetailRow[]> {
  const result = await db.query<MemberDetailRow>(
    `SELECT m.user_id AS "userId", u.name AS "userName", u.email AS "userEmail", u.is_active AS "userIsActive",
            ou.name_th AS "orgUnitName"
       FROM club_application_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE m.application_id = $1
      ORDER BY u.name NULLS LAST, u.email
      LIMIT 1000`,
    [applicationId],
  );
  return result.rows;
}

export interface ActivityDetailRow {
  activityDate: string | null;
  activityTime: string | null;
  title: string;
  note: string | null;
}

export async function listActivityDetails(applicationId: string, db: Queryable = pool): Promise<ActivityDetailRow[]> {
  // to_char คืนวันที่เป็นข้อความ 'YYYY-MM-DD' (กัน timezone เลื่อนวันตอนแปลงเป็น Date ใน JS)
  const result = await db.query<ActivityDetailRow>(
    `SELECT to_char(activity_date, 'YYYY-MM-DD') AS "activityDate", activity_time AS "activityTime", title, note
       FROM club_application_activities
      WHERE application_id = $1
      ORDER BY sort_order, activity_date NULLS LAST
      LIMIT 500`,
    [applicationId],
  );
  return result.rows;
}

export interface EventDetailRow {
  actorUserId: string | null;
  actorName: string | null;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  note: string | null;
  createdAt: Date;
}

export async function listApplicationEvents(applicationId: string, db: Queryable = pool): Promise<EventDetailRow[]> {
  const result = await db.query<EventDetailRow>(
    `SELECT e.actor_user_id AS "actorUserId", u.name AS "actorName", e.from_status AS "fromStatus",
            e.to_status AS "toStatus", e.note, e.created_at AS "createdAt"
       FROM club_application_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.application_id = $1
      ORDER BY e.created_at, e.id
      LIMIT 500`,
    [applicationId],
  );
  return result.rows;
}

export interface ApplicationListItem {
  id: string;
  type: ApplicationType;
  fiscalYear: number;
  status: ApplicationStatus;
  nameTh: string;
  updatedAt: Date;
}

export async function listApplicationsByApplicant(userId: string, db: Queryable = pool): Promise<ApplicationListItem[]> {
  // ใช้ index club_applications_applicant_user_id_idx
  const result = await db.query<ApplicationListItem>(
    `SELECT id, type, fiscal_year AS "fiscalYear", status, name_th AS "nameTh", updated_at AS "updatedAt"
       FROM club_applications
      WHERE applicant_user_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 50`,
    [userId],
  );
  return result.rows;
}

// ผู้ใช้เป็นที่ปรึกษาที่ถูกเสนอในคำขอนี้หรือไม่ (จับคู่ด้วย user_id หรือ email)
export async function isProposedAdvisor(
  applicationId: string,
  userId: string,
  email: string,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM club_application_advisors
        WHERE application_id = $1 AND (user_id = $2 OR email = $3)
     ) AS "exists"`,
    [applicationId, userId, email],
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * มีชมรมที่ยังดำเนินการอยู่ใช้ชื่อนี้หรือไม่ (normalize แบบเดียวกับ unique index clubs_name_th_active_key)
 * excludeClubId ใช้ตอนต่อทะเบียน (ชื่อของชมรมตัวเองไม่นับว่าซ้ำ)
 */
export async function isClubNameTaken(name: string, excludeClubId: string | null, db: Queryable = pool): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM clubs
        WHERE lower(regexp_replace(btrim(name_th), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim($1), '\\s+', ' ', 'g'))
          AND deleted_at IS NULL
          AND status <> 'dissolved'
          AND ($2::uuid IS NULL OR id <> $2)
     ) AS "exists"`,
    [name, excludeClubId],
  );
  return result.rows[0]?.exists ?? false;
}

// ---------- ขั้นตอนอนุมัติ ----------

// ล้างผลการยินยอมทั้งหมดกลับเป็น pending (ใช้ตอนผู้ยื่นขอความยินยอมรอบใหม่)
export async function resetAdvisorConsents(applicationId: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_application_advisors
        SET consent_status = 'pending', responded_at = NULL
      WHERE application_id = $1`,
    [applicationId],
  );
}

/**
 * บันทึกการตอบของที่ปรึกษา จับคู่แถวด้วย user_id หรือ email (กรณีถูกเสนอก่อนเคย login)
 * แล้วผูก user_id ให้ในคำสั่งเดียวกัน คืน true ถ้าพบแถวที่ยังรอตอบ
 */
export async function recordAdvisorResponse(
  applicationId: string,
  userId: string,
  email: string,
  decision: 'accepted' | 'declined',
  db: Queryable,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE club_application_advisors
        SET consent_status = $4, responded_at = now(), user_id = $2
      WHERE application_id = $1
        AND consent_status = 'pending'
        AND (user_id = $2 OR (user_id IS NULL AND email = $3))`,
    [applicationId, userId, email, decision],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markSubmitted(id: string, db: Queryable): Promise<void> {
  await db.query(`UPDATE club_applications SET status = 'submitted', submitted_at = now() WHERE id = $1`, [id]);
}

export async function markReviewed(id: string, reviewerId: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE club_applications SET status = 'reviewed', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
    [id, reviewerId],
  );
}

export async function markDecided(
  id: string,
  status: 'approved' | 'rejected',
  deciderId: string,
  note: string | null,
  clubId: string | null,
  db: Queryable,
): Promise<void> {
  await db.query(
    `UPDATE club_applications
        SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4,
            club_id = COALESCE($5::uuid, club_id)
      WHERE id = $1`,
    [id, status, deciderId, note, clubId],
  );
}

export interface AdvisorRequestItem extends ApplicationListItem {
  applicantName: string | null;
  myConsentStatus: 'pending' | 'accepted' | 'declined';
}

/**
 * คำขอที่ฉันถูกเสนอเป็นที่ปรึกษา (จับคู่ด้วย user_id หรือ email) ไม่รวมฉบับร่างที่ยังไม่ขอความยินยอม
 * ใช้ index club_application_advisors_email_idx / user_id_idx
 */
export async function listApplicationsForAdvisor(
  userId: string,
  email: string,
  db: Queryable = pool,
): Promise<AdvisorRequestItem[]> {
  const result = await db.query<AdvisorRequestItem>(
    `SELECT a.id, a.type, a.fiscal_year AS "fiscalYear", a.status, a.name_th AS "nameTh", a.updated_at AS "updatedAt",
            u.name AS "applicantName", adv.consent_status AS "myConsentStatus"
       FROM club_application_advisors adv
       JOIN club_applications a ON a.id = adv.application_id
       JOIN users u ON u.id = a.applicant_user_id
      WHERE (adv.user_id = $1 OR (adv.user_id IS NULL AND adv.email = $2))
        AND a.deleted_at IS NULL
        AND a.status NOT IN ('draft', 'cancelled')
      ORDER BY (adv.consent_status = 'pending' AND a.status = 'awaiting_consent') DESC, a.updated_at DESC
      LIMIT 50`,
    [userId, email],
  );
  return result.rows;
}

export interface QueueItem extends ApplicationListItem {
  applicantName: string | null;
  submittedAt: Date | null;
}

// คำขอตามสถานะ สำหรับกล่องงานเจ้าหน้าที่/นายกสโมสร (เก่าสุดก่อน = มาก่อนได้ก่อน) ใช้ index club_applications_status_idx
export async function listApplicationsByStatus(
  statuses: ApplicationStatus[],
  limit: number,
  db: Queryable = pool,
): Promise<QueueItem[]> {
  const result = await db.query<QueueItem>(
    `SELECT a.id, a.type, a.fiscal_year AS "fiscalYear", a.status, a.name_th AS "nameTh", a.updated_at AS "updatedAt",
            u.name AS "applicantName", a.submitted_at AS "submittedAt"
       FROM club_applications a
       JOIN users u ON u.id = a.applicant_user_id
      WHERE a.status = ANY($1::text[]) AND a.deleted_at IS NULL
      ORDER BY a.submitted_at NULLS LAST, a.created_at
      LIMIT $2`,
    [statuses, limit],
  );
  return result.rows;
}
