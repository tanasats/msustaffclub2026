import { pool, type Queryable } from '../db/pool.js';

export interface OrgUnitRecord {
  id: string;
  code: string;
  nameTh: string;
  hasStudents: boolean;
}

// ค้นคณะที่มีนิสิตจากรหัส 2 หลัก (หน่วยงานที่ไม่มีนิสิตหรือปิดใช้งานถือว่าไม่พบ) ใช้ index org_units_code_key
export async function findStudentFacultyByCode(code: string, db: Queryable = pool): Promise<OrgUnitRecord | null> {
  const result = await db.query<OrgUnitRecord>(
    `SELECT id, code, name_th AS "nameTh", has_students AS "hasStudents"
       FROM org_units
      WHERE code = $1
        AND has_students
        AND is_active`,
    [code],
  );
  return result.rows[0] ?? null;
}
