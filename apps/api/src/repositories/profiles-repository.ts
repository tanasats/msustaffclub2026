import { pool, type Queryable } from '../db/pool.js';
import type { ErpStaffInfo } from '../services/erp-hr-client.js';

export interface StudentProfileInput {
  userId: string;
  studentCode: string;
  orgUnitId: string | null;
}

// INSERT ครั้งแรก หรือ UPDATE ถ้ามีแล้ว (PK = user_id)
export async function upsertStudentProfile(input: StudentProfileInput, db: Queryable = pool): Promise<void> {
  await db.query(
    `INSERT INTO student_profiles (user_id, student_code, org_unit_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
        SET student_code = EXCLUDED.student_code,
            org_unit_id  = EXCLUDED.org_unit_id`,
    [input.userId, input.studentCode, input.orgUnitId],
  );
}

// บันทึกข้อมูลจาก ERP ล่าสุดทับของเดิมทั้งหมด พร้อมหน่วยงานที่จับคู่ได้ และเวลาที่ดึงสำเร็จ
export async function upsertStaffProfile(
  userId: string,
  info: ErpStaffInfo,
  orgUnitId: string | null,
  db: Queryable = pool,
): Promise<void> {
  await db.query(
    `INSERT INTO staff_profiles (
       user_id, staff_code,
       prefix_name_th, first_name_th, last_name_th,
       prefix_name_en, first_name_en, last_name_en,
       position_name_th,
       erp_faculty_id, erp_faculty_name,
       erp_department_id, erp_department_name,
       erp_program_id, erp_program_name,
       org_unit_id,
       synced_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
     ON CONFLICT (user_id) DO UPDATE
        SET staff_code          = EXCLUDED.staff_code,
            prefix_name_th      = EXCLUDED.prefix_name_th,
            first_name_th       = EXCLUDED.first_name_th,
            last_name_th        = EXCLUDED.last_name_th,
            prefix_name_en      = EXCLUDED.prefix_name_en,
            first_name_en       = EXCLUDED.first_name_en,
            last_name_en        = EXCLUDED.last_name_en,
            position_name_th    = EXCLUDED.position_name_th,
            erp_faculty_id      = EXCLUDED.erp_faculty_id,
            erp_faculty_name    = EXCLUDED.erp_faculty_name,
            erp_department_id   = EXCLUDED.erp_department_id,
            erp_department_name = EXCLUDED.erp_department_name,
            erp_program_id      = EXCLUDED.erp_program_id,
            erp_program_name    = EXCLUDED.erp_program_name,
            org_unit_id         = EXCLUDED.org_unit_id,
            synced_at           = EXCLUDED.synced_at`,
    [
      userId,
      info.staffCode,
      info.prefixNameTh,
      info.firstNameTh,
      info.lastNameTh,
      info.prefixNameEn,
      info.firstNameEn,
      info.lastNameEn,
      info.positionNameTh,
      info.erpFacultyId,
      info.erpFacultyName,
      info.erpDepartmentId,
      info.erpDepartmentName,
      info.erpProgramId,
      info.erpProgramName,
      orgUnitId,
    ],
  );
}

export interface StudentProfile {
  studentCode: string;
  faculty: { code: string; nameTh: string } | null;
}

// LEFT JOIN เพราะนิสิตบางคนอาจไม่มีคณะ (รหัสคณะไม่อยู่ในตาราง)
export async function findStudentProfile(userId: string, db: Queryable = pool): Promise<StudentProfile | null> {
  const result = await db.query<{ studentCode: string; facultyCode: string | null; facultyNameTh: string | null }>(
    `SELECT sp.student_code AS "studentCode",
            ou.code         AS "facultyCode",
            ou.name_th      AS "facultyNameTh"
       FROM student_profiles sp
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE sp.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    studentCode: row.studentCode,
    faculty: row.facultyCode && row.facultyNameTh ? { code: row.facultyCode, nameTh: row.facultyNameTh } : null,
  };
}

export interface StaffProfile {
  staffCode: string;
  fullNameTh: string | null;
  positionNameTh: string | null;
  facultyName: string | null;
  departmentName: string | null;
  programName: string | null;
  // หน่วยงานใน org_units ที่จับคู่ได้ (null = ยังจับคู่ไม่ได้)
  orgUnit: { code: string; nameTh: string } | null;
  syncedAt: Date;
}

export async function findStaffProfile(userId: string, db: Queryable = pool): Promise<StaffProfile | null> {
  // ชื่อเต็มแบบไทย: คำนำหน้าติดชื่อ (นายสมชาย) เว้นวรรคแล้วนามสกุล
  // concat() ถือ NULL เป็นข้อความว่าง (ต่างจาก || ที่ได้ NULL ทั้งก้อน), concat_ws ข้ามค่า NULL
  // NULLIF เปลี่ยนผลที่ว่างเปล่าเป็น NULL
  // LEFT JOIN เพราะบุคลากรบางคนยังจับคู่หน่วยงานไม่ได้
  const result = await db.query<Omit<StaffProfile, 'orgUnit'> & { orgUnitCode: string | null; orgUnitNameTh: string | null }>(
    `SELECT sp.staff_code AS "staffCode",
            NULLIF(concat_ws(' ', NULLIF(concat(sp.prefix_name_th, sp.first_name_th), ''), sp.last_name_th), '') AS "fullNameTh",
            sp.position_name_th    AS "positionNameTh",
            sp.erp_faculty_name    AS "facultyName",
            sp.erp_department_name AS "departmentName",
            sp.erp_program_name    AS "programName",
            ou.code                AS "orgUnitCode",
            ou.name_th             AS "orgUnitNameTh",
            sp.synced_at           AS "syncedAt"
       FROM staff_profiles sp
       LEFT JOIN org_units ou ON ou.id = sp.org_unit_id
      WHERE sp.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const { orgUnitCode, orgUnitNameTh, ...rest } = row;
  return { ...rest, orgUnit: orgUnitCode && orgUnitNameTh ? { code: orgUnitCode, nameTh: orgUnitNameTh } : null };
}
