import { pool, type Queryable } from '../db/pool.js';

/**
 * ข้อมูลส่วนบุคคลทั้งหมดของผู้ใช้ 1 คน (สิทธิขอเข้าถึงและรับสำเนา — PDPA มาตรา 30)
 * ทุกคำสั่งกรองด้วย user_id ของผู้ขอเท่านั้น และคืนเฉพาะข้อมูลของผู้นั้น (ชื่อชมรม/รายการเป็นบริบท ไม่ใช่ข้อมูลของผู้อื่น)
 * วันที่แบบ date คืนเป็นข้อความ 'YYYY-MM-DD' (ไม่เลื่อนตามเขตเวลา), เวลาเป็น timestamptz
 */

const LIMIT = 500;

export interface MyAccount {
  email: string;
  name: string | null;
  pictureUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  fontScale: string | null;
  roles: { code: string; nameTh: string }[];
}

export async function getMyAccount(userId: string, db: Queryable = pool): Promise<MyAccount | null> {
  const result = await db.query<MyAccount>(
    `SELECT u.email, u.name, u.picture_url AS "pictureUrl", u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
            p.font_scale AS "fontScale",
            COALESCE((SELECT json_agg(json_build_object('code', r.code, 'nameTh', r.name_th) ORDER BY r.code)
                        FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::json) AS roles
       FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export interface MyStaffProfile {
  staffCode: string;
  prefixNameTh: string | null;
  firstNameTh: string | null;
  lastNameTh: string | null;
  prefixNameEn: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  positionNameTh: string | null;
  facultyName: string | null;
  departmentName: string | null;
  programName: string | null;
  syncedAt: Date;
}

export async function getMyStaffProfile(userId: string, db: Queryable = pool): Promise<MyStaffProfile | null> {
  const result = await db.query<MyStaffProfile>(
    `SELECT staff_code AS "staffCode", prefix_name_th AS "prefixNameTh", first_name_th AS "firstNameTh", last_name_th AS "lastNameTh",
            prefix_name_en AS "prefixNameEn", first_name_en AS "firstNameEn", last_name_en AS "lastNameEn",
            position_name_th AS "positionNameTh", erp_faculty_name AS "facultyName", erp_department_name AS "departmentName",
            erp_program_name AS "programName", synced_at AS "syncedAt"
       FROM staff_profiles WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function getMyStudentProfile(userId: string, db: Queryable = pool): Promise<{ studentCode: string; facultyName: string | null } | null> {
  const result = await db.query<{ studentCode: string; facultyName: string | null }>(
    `SELECT s.student_code AS "studentCode", o.name_th AS "facultyName"
       FROM student_profiles s LEFT JOIN org_units o ON o.id = s.org_unit_id
      WHERE s.user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function listMyPrivacyAcknowledgements(userId: string, db: Queryable = pool) {
  const result = await db.query<{ version: string; acknowledgedAt: Date }>(
    `SELECT notice_version AS version, acknowledged_at AS "acknowledgedAt"
       FROM privacy_notice_acknowledgements WHERE user_id = $1 ORDER BY acknowledged_at LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function listMyMemberships(userId: string, db: Queryable = pool) {
  const result = await db.query<{ clubName: string; status: string; appliedAt: Date; decidedAt: Date | null; endedOn: string | null; endReason: string | null }>(
    `SELECT c.name_th AS "clubName", m.status, m.applied_at AS "appliedAt", m.decided_at AS "decidedAt",
            to_char(m.ended_on, 'YYYY-MM-DD') AS "endedOn", m.end_reason AS "endReason"
       FROM club_memberships m JOIN clubs c ON c.id = m.club_id
      WHERE m.user_id = $1 ORDER BY m.applied_at DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

// ตำแหน่งกรรมการชมรม (รวมเบอร์โทร/สถานที่ทำงาน/ประวัติย่อที่กรอกไว้)
export async function listMyCommitteePositions(userId: string, db: Queryable = pool) {
  const result = await db.query<{
    clubName: string;
    positionTitle: string;
    workLocation: string | null;
    contactPhone: string | null;
    bio: string | null;
    startedOn: string;
    endedOn: string | null;
  }>(
    `SELECT c.name_th AS "clubName", cm.position_title AS "positionTitle", cm.work_location AS "workLocation",
            cm.contact_phone AS "contactPhone", cm.bio, to_char(cm.started_on, 'YYYY-MM-DD') AS "startedOn",
            to_char(cm.ended_on, 'YYYY-MM-DD') AS "endedOn"
       FROM club_committee_members cm JOIN clubs c ON c.id = cm.club_id
      WHERE cm.user_id = $1 ORDER BY cm.started_on DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function listMyAdvisorships(userId: string, db: Queryable = pool) {
  const result = await db.query<{ clubName: string; fiscalYear: number; startedOn: string; endedOn: string | null }>(
    `SELECT c.name_th AS "clubName", a.fiscal_year AS "fiscalYear", to_char(a.started_on, 'YYYY-MM-DD') AS "startedOn",
            to_char(a.ended_on, 'YYYY-MM-DD') AS "endedOn"
       FROM club_advisors a JOIN clubs c ON c.id = a.club_id
      WHERE a.user_id = $1 ORDER BY a.started_on DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

// คำขอจัดตั้ง/ต่อทะเบียนที่ฉันยื่น — รวมที่ลบออกจากรายการแล้ว เพราะระบบยังเก็บไว้ (สิทธิขอเข้าถึงครอบคลุมข้อมูลที่ยังเก็บ)
export async function listMyApplications(userId: string, db: Queryable = pool) {
  const result = await db.query<{
    nameTh: string;
    type: string;
    fiscalYear: number;
    status: string;
    createdAt: Date;
    submittedAt: Date | null;
    deletedAt: Date | null;
  }>(
    `SELECT name_th AS "nameTh", type, fiscal_year AS "fiscalYear", status, created_at AS "createdAt", submitted_at AS "submittedAt",
            deleted_at AS "deletedAt"
       FROM club_applications WHERE applicant_user_id = $1 ORDER BY created_at DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

// ข้อมูลของฉันในคำขอของผู้อื่น: ถูกเสนอเป็นที่ปรึกษา และถูกระบุเป็นกรรมการ (พร้อมข้อมูลติดต่อที่ผู้ยื่นกรอก)
// รวมคำขอที่ผู้ยื่นลบออกจากรายการแล้ว เพราะระบบยังเก็บข้อมูลไว้
export async function listMyApplicationRoles(userId: string, email: string, db: Queryable = pool) {
  const result = await db.query<{
    applicationName: string;
    role: 'advisor' | 'committee';
    detail: string | null;
    contactPhone: string | null;
    workLocation: string | null;
    bio: string | null;
  }>(
    `SELECT a.name_th AS "applicationName", 'advisor' AS role, adv.consent_status AS detail,
            NULL AS "contactPhone", NULL AS "workLocation", NULL AS bio
       FROM club_application_advisors adv JOIN club_applications a ON a.id = adv.application_id
      WHERE adv.user_id = $1 OR (adv.user_id IS NULL AND adv.email = $2)
     UNION ALL
     SELECT a.name_th, 'committee', ac.position_title, ac.contact_phone, ac.work_location, ac.bio
       FROM club_application_committee ac JOIN club_applications a ON a.id = ac.application_id
      WHERE ac.user_id = $1
     LIMIT ${LIMIT}`,
    [userId, email],
  );
  return result.rows;
}

export async function listMyAchievements(userId: string, db: Queryable = pool) {
  const result = await db.query<{
    clubName: string;
    title: string;
    achievedOn: string;
    level: string;
    category: string;
    award: string | null;
    organizer: string | null;
    status: string;
  }>(
    `SELECT c.name_th AS "clubName", a.title, to_char(a.achieved_on, 'YYYY-MM-DD') AS "achievedOn", a.level, a.category,
            a.award, a.organizer, a.status
       FROM club_achievements a JOIN clubs c ON c.id = a.club_id
      WHERE a.user_id = $1 ORDER BY a.achieved_on DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function listMyActivityParticipation(userId: string, db: Queryable = pool) {
  const result = await db.query<{ clubName: string; title: string; heldOn: string }>(
    `SELECT c.name_th AS "clubName", act.title, to_char(act.held_on, 'YYYY-MM-DD') AS "heldOn"
       FROM club_activity_participants p
       JOIN club_activities act ON act.id = p.activity_id AND act.deleted_at IS NULL
       JOIN clubs c ON c.id = act.club_id
      WHERE p.user_id = $1 ORDER BY act.held_on DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function listMyAthleteRecords(userId: string, db: Queryable = pool) {
  const result = await db.query<{ clubName: string; sportName: string; eventOrPosition: string | null; since: string; endedAt: Date | null }>(
    `SELECT c.name_th AS "clubName", s.name_th AS "sportName", a.event_or_position AS "eventOrPosition",
            to_char((a.created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS since, a.ended_at AS "endedAt"
       FROM club_athletes a JOIN clubs c ON c.id = a.club_id JOIN sports s ON s.id = a.sport_id
      WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

// ผลการแข่งขันพร้อมค่าสถิติรายบุคคล (json_agg ค่าสถิติต่อผล 1 รายการ)
export async function listMyCompetitionResults(userId: string, db: Queryable = pool) {
  const result = await db.query<{
    title: string;
    eventName: string | null;
    sportName: string;
    heldFrom: string;
    rank: number | null;
    medal: string | null;
    stats: { name: string; value: number; unit: string | null }[];
  }>(
    `SELECT comp.title, comp.event_name AS "eventName", s.name_th AS "sportName", to_char(comp.held_from, 'YYYY-MM-DD') AS "heldFrom",
            r.rank, r.medal,
            COALESCE((SELECT json_agg(json_build_object('name', d.name_th, 'value', rs.value::float8, 'unit', d.unit) ORDER BY d.sort_order)
                        FROM sport_result_stats rs JOIN sport_stat_definitions d ON d.id = rs.stat_definition_id
                       WHERE rs.result_id = r.id), '[]'::json) AS stats
       FROM sport_competition_results r
       JOIN sport_competitions comp ON comp.id = r.competition_id AND comp.deleted_at IS NULL
       JOIN sports s ON s.id = comp.sport_id
      WHERE r.user_id = $1 ORDER BY comp.held_from DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

/**
 * ผลการคัดเลือกที่เกี่ยวกับฉัน — เฉพาะรอบที่ประกาศผลแล้ว (closed)
 * รอบที่ยังพิจารณาอยู่ไม่แสดง เพื่อไม่ให้กระทบกระบวนการตัดสินของคณะกรรมการ (ดู docs/design/pdpa.md)
 */
export async function listMySelectionResults(userId: string, db: Queryable = pool) {
  const result = await db.query<{ roundTitle: string; kind: string; fiscalYear: number; decision: string; reason: string; announcedAt: Date }>(
    `SELECT r.title AS "roundTitle", r.kind, r.fiscal_year AS "fiscalYear", c.decision, c.reason, r.closed_at AS "announcedAt"
       FROM selection_candidates c JOIN selection_rounds r ON r.id = c.round_id AND r.status = 'closed'
      WHERE c.user_id = $1 ORDER BY r.closed_at DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function listMyUploadedFiles(userId: string, db: Queryable = pool) {
  const result = await db.query<{ originalName: string; purpose: string; sizeBytes: number; uploadedAt: Date | null }>(
    `SELECT original_name AS "originalName", purpose, size_bytes::int AS "sizeBytes", uploaded_at AS "uploadedAt"
       FROM files WHERE uploaded_by = $1 AND deleted_at IS NULL AND status = 'uploaded'
      ORDER BY uploaded_at DESC NULLS LAST LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function listMyEmails(userId: string, db: Queryable = pool) {
  const result = await db.query<{ subject: string; status: string; createdAt: Date; sentAt: Date | null }>(
    `SELECT subject, status, created_at AS "createdAt", sent_at AS "sentAt"
       FROM email_outbox WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT ${LIMIT}`,
    [userId],
  );
  return result.rows;
}

export async function getMySessionSummary(userId: string, db: Queryable = pool) {
  const result = await db.query<{ active: number; lastSeenAt: Date | null }>(
    `SELECT count(*) FILTER (WHERE expires_at > now())::int AS active, max(last_seen_at) AS "lastSeenAt"
       FROM sessions WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]!;
}
