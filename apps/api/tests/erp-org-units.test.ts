import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import type { ErpStaffInfo } from '../src/services/erp-hr-client.js';
import { resetDatabase } from './helpers/db.js';
import { loginWithGoogle, SAMPLE_STAFF_INFO, sessionCookieOf } from './helpers/auth.js';

beforeEach(resetDatabase);
afterEach(async () => {
  vi.restoreAllMocks();
  // หน่วยงานที่ test สร้างเพิ่ม: ต้องล้างตารางที่อ้างถึงก่อน (FK เป็น RESTRICT)
  await resetDatabase();
  await pool.query("DELETE FROM org_units WHERE code = '99'");
});

const STAFF = { sub: 'staff-sub', email: 'somchai.j@msu.ac.th' };

async function loginStaff(erp: ErpStaffInfo) {
  return loginWithGoogle(createApp(), STAFF, { erp });
}

async function staffOrgUnitCode(): Promise<string | null> {
  const { rows } = await pool.query<{ code: string | null }>(
    'SELECT ou.code FROM staff_profiles sp LEFT JOIN org_units ou ON ou.id = sp.org_unit_id',
  );
  return rows[0]?.code ?? null;
}

async function mappings() {
  const { rows } = await pool.query(
    `SELECT e.erp_id, e.name_th, ou.code, e.match_source
       FROM erp_org_units e LEFT JOIN org_units ou ON ou.id = e.org_unit_id
      ORDER BY e.erp_id`,
  );
  return rows;
}

describe('ผูกหน่วยงานของ ERP กับ org_units', () => {
  it('จับคู่จากชื่อได้ทั้งสองระดับ และเลือกระดับกอง/ฝ่ายเป็นหน่วยงานของบุคลากร', async () => {
    await loginStaff(SAMPLE_STAFF_INFO); // สำนักงานอธิการบดี (80) > กองแผนงาน (82)

    expect(await staffOrgUnitCode()).toBe('82');
    expect(await mappings()).toEqual([
      { erp_id: '201092700000', name_th: 'สำนักงานอธิการบดี', code: '80', match_source: 'name' },
      { erp_id: '201092704000', name_th: 'กองแผนงาน', code: '82', match_source: 'name' },
    ]);
  });

  it('กอง/ฝ่ายจับคู่ไม่ได้ → ใช้คณะแทน และบันทึกกอง/ฝ่ายไว้เป็นรายการรอจับคู่', async () => {
    await loginStaff({
      ...SAMPLE_STAFF_INFO,
      erpFacultyId: '201020000000',
      erpFacultyName: 'คณะวิทยาศาสตร์',
      erpDepartmentId: '201020100000',
      erpDepartmentName: 'ภาควิชาเคมี',
    });

    expect(await staffOrgUnitCode()).toBe('02');
    expect(await mappings()).toEqual([
      { erp_id: '201020000000', name_th: 'คณะวิทยาศาสตร์', code: '02', match_source: 'name' },
      { erp_id: '201020100000', name_th: 'ภาควิชาเคมี', code: null, match_source: null },
    ]);
  });

  it('จับคู่ไม่ได้เลย → หน่วยงานของบุคลากรเป็น NULL แต่ยัง login ได้', async () => {
    const res = await loginStaff({
      ...SAMPLE_STAFF_INFO,
      erpFacultyName: 'หน่วยงานที่ไม่มีในระบบ',
      erpDepartmentName: 'ฝ่ายที่ไม่มีในระบบ',
    });

    expect(sessionCookieOf(res)).toBeTruthy();
    expect(await staffOrgUnitCode()).toBeNull();
  });

  it('ชื่อจาก ERP มีช่องว่างเกิน ยังจับคู่ได้', async () => {
    await loginStaff({ ...SAMPLE_STAFF_INFO, erpDepartmentName: '  กองแผนงาน  ' });
    expect(await staffOrgUnitCode()).toBe('82');
  });

  it('ไม่มีรหัสหน่วยงานจาก ERP → ไม่บันทึกการจับคู่ และหน่วยงานเป็น NULL', async () => {
    await loginStaff({ ...SAMPLE_STAFF_INFO, erpFacultyId: null, erpDepartmentId: null });
    expect(await mappings()).toEqual([]);
    expect(await staffOrgUnitCode()).toBeNull();
  });

  it('การจับคู่ที่ผู้ดูแลกำหนดเอง (manual) ไม่ถูกทับ แม้ ERP เปลี่ยนชื่อ', async () => {
    await loginStaff(SAMPLE_STAFF_INFO);
    await pool.query(
      `UPDATE erp_org_units
          SET org_unit_id = (SELECT id FROM org_units WHERE code = '81'), match_source = 'manual'
        WHERE erp_id = '201092704000'`,
    );

    await loginStaff({ ...SAMPLE_STAFF_INFO, erpDepartmentName: 'กองแผนงาน (ชื่อใหม่)' });

    expect(await staffOrgUnitCode()).toBe('81');
    const rows = await mappings();
    expect(rows[1]).toEqual({ erp_id: '201092704000', name_th: 'กองแผนงาน (ชื่อใหม่)', code: '81', match_source: 'manual' });
  });

  it('รายการที่เคยจับคู่ไม่ได้ จะถูกจับคู่เมื่อมีหน่วยงานชื่อนั้นเพิ่มเข้ามาภายหลัง', async () => {
    const info = { ...SAMPLE_STAFF_INFO, erpDepartmentId: '201099900000', erpDepartmentName: 'กองทดสอบ' };
    await loginStaff(info);
    expect(await staffOrgUnitCode()).toBe('80'); // ตกไปใช้ระดับคณะ/สำนัก

    await pool.query("INSERT INTO org_units (code, name_th) VALUES ('99', 'กองทดสอบ')");
    await loginStaff(info);

    expect(await staffOrgUnitCode()).toBe('99');
  });

  it('GET /auth/me คืนหน่วยงานที่จับคู่ได้', async () => {
    const app = createApp();
    const res = await loginWithGoogle(app, STAFF, { erp: SAMPLE_STAFF_INFO });
    const me = await request(app).get('/auth/me').set('Cookie', sessionCookieOf(res)!);
    expect(me.body.profile.staff.orgUnit).toEqual({ code: '82', nameTh: 'กองแผนงาน' });
  });
});

describe('constraint ของ erp_org_units', () => {
  it('จับคู่แล้วต้องระบุที่มา (match_source)', async () => {
    await expect(
      pool.query(
        "INSERT INTO erp_org_units (erp_id, name_th, org_unit_id) SELECT 'x', 'x', id FROM org_units WHERE code = '01'",
      ),
    ).rejects.toThrow(/erp_org_units_match_consistency/);
  });
});
