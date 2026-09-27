import type { Queryable } from '../db/pool.js';

// ข้อมูลผู้รับอีเมลแจ้งเตือน (เรียกใน transaction ของเหตุการณ์) — ผู้รับต้องเป็นผู้ใช้ที่ยังใช้งานอยู่
export interface Recipient {
  userId: string | null;
  email: string;
  name: string | null;
}

export interface ApplicationNotice {
  id: string;
  type: 'establish' | 'renewal';
  nameTh: string;
  applicant: Recipient;
  applicantActive: boolean;
}

export async function getApplicationNotice(applicationId: string, db: Queryable): Promise<ApplicationNotice | null> {
  const result = await db.query<{
    id: string;
    type: 'establish' | 'renewal';
    nameTh: string;
    userId: string;
    email: string;
    name: string | null;
    isActive: boolean;
  }>(
    `SELECT a.id, a.type, a.name_th AS "nameTh", u.id AS "userId", u.email, u.name, u.is_active AS "isActive"
       FROM club_applications a JOIN users u ON u.id = a.applicant_user_id
      WHERE a.id = $1`,
    [applicationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    nameTh: row.nameTh,
    applicant: { userId: row.userId, email: row.email, name: row.name },
    applicantActive: row.isActive,
  };
}

/**
 * ที่ปรึกษาบุคลากรที่ยังไม่ตอบ (มี email; ที่ปรึกษาภายนอกไม่มี email ในระบบจึงไม่อยู่ในรายการ)
 * ผูกผู้ใช้ด้วย user_id หรือ email (ถูกเสนอก่อนเคย login) และตัดบัญชีที่ถูกระงับออก
 */
export async function listPendingInternalAdvisors(applicationId: string, db: Queryable): Promise<Recipient[]> {
  const result = await db.query<Recipient>(
    `SELECT u.id AS "userId", adv.email, u.name
       FROM club_application_advisors adv
       LEFT JOIN users u ON u.id = adv.user_id OR (adv.user_id IS NULL AND u.email = adv.email)
      WHERE adv.application_id = $1 AND adv.email IS NOT NULL AND adv.consent_status = 'pending'
        AND (u.id IS NULL OR u.is_active)
      ORDER BY adv.sort_order`,
    [applicationId],
  );
  return result.rows;
}

/**
 * ผู้ใช้ที่ถือ role ซึ่งผูก permission นี้ (ไม่รวม super_admin ที่ผ่านทุกสิทธิ์โดยไม่ได้ถือ role นั้น เพื่อไม่ให้อีเมลท่วม)
 * ตัดผู้กระทำออก (ไม่แจ้งตัวเอง)
 */
export async function listUsersWithPermission(permission: string, excludeUserId: string | null, db: Queryable): Promise<Recipient[]> {
  const result = await db.query<Recipient>(
    `SELECT DISTINCT u.id AS "userId", u.email, u.name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id AND p.code = $1
      WHERE u.is_active AND ($2::uuid IS NULL OR u.id <> $2)
      ORDER BY u.email
      LIMIT 50`,
    [permission, excludeUserId],
  );
  return result.rows;
}

export interface MonthlyReportNotice {
  id: string;
  clubId: string;
  clubName: string;
  reportMonth: string;
}

export async function getMonthlyReportNotice(reportId: string, db: Queryable): Promise<MonthlyReportNotice | null> {
  const result = await db.query<MonthlyReportNotice>(
    `SELECT r.id, c.id AS "clubId", c.name_th AS "clubName", to_char(r.report_month, 'YYYY-MM-DD') AS "reportMonth"
       FROM club_monthly_reports r JOIN clubs c ON c.id = r.club_id
      WHERE r.id = $1`,
    [reportId],
  );
  return result.rows[0] ?? null;
}

// ที่ปรึกษาของชมรมที่ยังอยู่ในวาระ (เฉพาะที่เป็นผู้ใช้ในระบบและยังใช้งานอยู่)
export async function listCurrentAdvisorUsers(clubId: string, db: Queryable): Promise<Recipient[]> {
  const result = await db.query<Recipient>(
    `SELECT u.id AS "userId", u.email, u.name
       FROM club_advisors ca JOIN users u ON u.id = ca.user_id AND u.is_active
      WHERE ca.club_id = $1 AND ca.ended_on IS NULL
      ORDER BY u.email`,
    [clubId],
  );
  return result.rows;
}
