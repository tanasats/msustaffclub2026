import type { DbClient } from '../db/pool.js';
import { upsertErpOrgUnit } from '../repositories/erp-org-units-repository.js';
import type { ErpStaffInfo } from './erp-hr-client.js';

// ตัดช่องว่างหัวท้ายและยุบช่องว่างซ้อนให้เหลือช่องเดียว ก่อนเทียบชื่อ
export function normalizeUnitName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

async function resolve(erpId: string | null, name: string | null, client: DbClient): Promise<string | null> {
  if (!erpId || !name) {
    return null;
  }
  return upsertErpOrgUnit(erpId, normalizeUnitName(name), client);
}

/**
 * หา org_unit_id ของบุคลากรจากข้อมูล ERP
 * บันทึกทั้งระดับกอง/ฝ่าย และคณะ/สำนัก ลงตารางจับคู่ แล้วเลือกระดับที่ละเอียดที่สุดที่จับคู่ได้
 */
export async function resolveStaffOrgUnit(info: ErpStaffInfo, client: DbClient): Promise<string | null> {
  const departmentUnitId = await resolve(info.erpDepartmentId, info.erpDepartmentName, client);
  const facultyUnitId = await resolve(info.erpFacultyId, info.erpFacultyName, client);
  return departmentUnitId ?? facultyUnitId;
}
