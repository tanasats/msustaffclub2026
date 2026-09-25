import { pool, type Queryable } from '../db/pool.js';
import type { ApplicationStatus } from './club-applications-repository.js';

export interface ClubRegistration {
  status: 'active' | 'suspended' | 'dissolved';
  registeredUntil: string;
}

// สถานะและวันหมดอายุทะเบียนของชมรม พร้อมล็อก (กันยื่นต่อทะเบียนซ้อนกัน 2 คำขอ)
export async function lockClubRegistration(clubId: string, db: Queryable): Promise<ClubRegistration | null> {
  const result = await db.query<ClubRegistration>(
    `SELECT status, to_char(registered_until, 'YYYY-MM-DD') AS "registeredUntil"
       FROM clubs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [clubId],
  );
  return result.rows[0] ?? null;
}

export async function findClubRegistration(clubId: string, db: Queryable = pool): Promise<ClubRegistration | null> {
  const result = await db.query<ClubRegistration>(
    `SELECT status, to_char(registered_until, 'YYYY-MM-DD') AS "registeredUntil"
       FROM clubs WHERE id = $1 AND deleted_at IS NULL`,
    [clubId],
  );
  return result.rows[0] ?? null;
}

// คำขอต่อทะเบียนของปีงบประมาณที่ยังดำเนินการอยู่ หรืออนุมัติแล้ว (ไม่นับที่ไม่อนุมัติ/ยกเลิก)
export async function findRenewalApplication(
  clubId: string,
  fiscalYear: number,
  db: Queryable = pool,
): Promise<{ id: string; status: ApplicationStatus } | null> {
  const result = await db.query<{ id: string; status: ApplicationStatus }>(
    `SELECT id, status FROM club_applications
      WHERE club_id = $1 AND type = 'renewal' AND fiscal_year = $2 AND deleted_at IS NULL
        AND status NOT IN ('rejected', 'cancelled')
      ORDER BY created_at DESC
      LIMIT 1`,
    [clubId, fiscalYear],
  );
  return result.rows[0] ?? null;
}

/**
 * สร้างคำขอต่อทะเบียนโดยคัดลอกข้อมูลปัจจุบันของชมรม (INSERT ... SELECT ในคำสั่งเดียว)
 * ผู้ยื่นแก้ข้อมูลทั่วไปและระเบียบในคำขอได้ มีผลกับชมรมเมื่ออนุมัติเท่านั้น
 */
export async function insertRenewalFromClub(clubId: string, fiscalYear: number, applicantUserId: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO club_applications (
       type, club_id, fiscal_year, applicant_user_id, name_th, category_id, category_detail, history, motto,
       logo_meaning, logo_file_id, objectives, office_location, contact_phone, contact_email, regulation_text
     )
     SELECT 'renewal', id, $2, $3, name_th, category_id, category_detail, history, motto,
            logo_meaning, logo_file_id, objectives, office_location, contact_phone, contact_email, regulation_text
       FROM clubs
      WHERE id = $1
     RETURNING id`,
    [clubId, fiscalYear, applicantUserId],
  );
  return result.rows[0]!.id;
}

/**
 * เสนอที่ปรึกษาชุดปัจจุบันให้อัตโนมัติ (ยังต้องยินยอมใหม่สำหรับปีงบประมาณใหม่)
 * บุคลากร: ใช้ email ของบัญชี, บุคคลภายนอก: ใช้ external_person_id เดิม (ต้องแนบใบคำยินยอมใหม่)
 * row_number() ให้ลำดับ 1, 2 ตามลำดับที่เป็นที่ปรึกษา
 */
export async function copyCurrentAdvisorsToApplication(applicationId: string, clubId: string, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO club_application_advisors (application_id, email, user_id, external_person_id, sort_order)
     SELECT $1,
            CASE WHEN a.user_id IS NOT NULL THEN lower(u.email) END,
            a.user_id,
            a.external_person_id,
            row_number() OVER (ORDER BY a.started_on, a.created_at)
       FROM club_advisors a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.club_id = $2 AND a.ended_on IS NULL
      ORDER BY a.started_on, a.created_at
      LIMIT 2`,
    [applicationId, clubId],
  );
}

/**
 * อนุมัติต่อทะเบียน: ปรับข้อมูลชมรมตามคำขอ และขยายทะเบียน (UPDATE ... FROM คำขอ ในคำสั่งเดียว)
 * ชื่อซ้ำกับชมรมอื่นที่ยังดำเนินการอยู่จะชน unique index clubs_name_th_active_key (23505)
 */
export async function updateClubFromRenewal(clubId: string, applicationId: string, registeredUntil: string, db: Queryable): Promise<void> {
  await db.query(
    `UPDATE clubs c
        SET name_th = a.name_th, category_id = a.category_id, category_detail = a.category_detail,
            history = a.history, motto = a.motto, logo_meaning = a.logo_meaning, logo_file_id = a.logo_file_id,
            objectives = a.objectives, office_location = a.office_location, contact_phone = a.contact_phone,
            contact_email = a.contact_email, regulation_text = a.regulation_text,
            registered_until = $3::date
       FROM club_applications a
      WHERE c.id = $1 AND a.id = $2`,
    [clubId, applicationId, registeredUntil],
  );
}

// ที่ปรึกษาชุดเดิมสิ้นสุด (ก่อนบันทึกชุดใหม่ของปีงบประมาณใหม่)
export async function endCurrentAdvisors(clubId: string, endedOn: string, db: Queryable): Promise<void> {
  await db.query(
    'UPDATE club_advisors SET ended_on = $2::date WHERE club_id = $1 AND ended_on IS NULL',
    [clubId, endedOn],
  );
}

// จำนวนสมาชิก active ของชมรม ณ ปัจจุบัน
export async function countActiveMembers(clubId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM club_memberships WHERE club_id = $1 AND status = 'active'`,
    [clubId],
  );
  return result.rows[0]?.count ?? 0;
}

// รายงานประจำปีของปีงบประมาณ (null = ยังไม่มี)
export async function findAnnualReportStatus(
  clubId: string,
  fiscalYear: number,
  db: Queryable = pool,
): Promise<{ id: string; status: 'draft' | 'submitted' | 'acknowledged' } | null> {
  const result = await db.query<{ id: string; status: 'draft' | 'submitted' | 'acknowledged' }>(
    'SELECT id, status FROM club_annual_reports WHERE club_id = $1 AND fiscal_year = $2',
    [clubId, fiscalYear],
  );
  return result.rows[0] ?? null;
}
