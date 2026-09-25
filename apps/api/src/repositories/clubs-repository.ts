import type { Queryable } from '../db/pool.js';

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
       name_th, category_id, category_detail, motto, logo_meaning, history, objectives,
       office_location, contact_phone, contact_email, regulation_text, established_on, registered_until
     )
     SELECT name_th, category_id, category_detail, motto, logo_meaning, history, objectives,
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

export async function insertCommitteeFromApplication(
  clubId: string,
  applicationId: string,
  startedOn: string,
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO club_committee_members
       (club_id, user_id, position_id, position_title, sort_order, work_location, contact_phone, bio, started_on)
     SELECT $1, user_id, position_id, position_title, sort_order, work_location, contact_phone, bio, $3::date
       FROM club_application_committee
      WHERE application_id = $2`,
    [clubId, applicationId, startedOn],
  );
}

/**
 * สมาชิกตั้งต้น = กรรมการ ∪ สมาชิกที่ระบุ (UNION ตัดคนซ้ำ) เฉพาะบัญชีที่ยังใช้งานได้
 * เป็นสมาชิก active ทันที (decided_by = NULL คือระบบอนุมัติพร้อมการจัดตั้ง)
 */
export async function insertMembershipsFromApplication(
  clubId: string,
  applicationId: string,
  db: Queryable,
): Promise<number> {
  const result = await db.query(
    `INSERT INTO club_memberships (club_id, user_id, status, decided_at)
     SELECT $1, people.user_id, 'active', now()
       FROM (
         SELECT user_id FROM club_application_committee WHERE application_id = $2
         UNION
         SELECT user_id FROM club_application_members WHERE application_id = $2
       ) AS people
       JOIN users u ON u.id = people.user_id AND u.is_active`,
    [clubId, applicationId],
  );
  return result.rowCount ?? 0;
}
