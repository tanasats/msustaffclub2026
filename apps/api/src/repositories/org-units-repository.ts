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

// หน่วยงานที่ใช้งานอยู่ทั้งหมด (ตัวเลือกตอนผู้ดูแลเพิ่มบุคลากรล่วงหน้า) — มีไม่เกินร้อยหน่วยงาน
export async function listActiveOrgUnits(db: Queryable = pool): Promise<{ id: string; code: string; nameTh: string }[]> {
  const result = await db.query<{ id: string; code: string; nameTh: string }>(
    `SELECT id, code, name_th AS "nameTh" FROM org_units WHERE is_active ORDER BY code LIMIT 500`,
  );
  return result.rows;
}

export async function isActiveOrgUnit(id: string, db: Queryable = pool): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM org_units WHERE id = $1 AND is_active) AS "exists"`, [id]);
  return result.rows[0]?.exists ?? false;
}
