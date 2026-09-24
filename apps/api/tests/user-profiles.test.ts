import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { erpHr } from '../src/services/erp-hr-client.js';
import { resetDatabase } from './helpers/db.js';
import { FAKE_ACCESS_TOKEN, loginWithGoogle, SAMPLE_STAFF_INFO, sessionCookieOf } from './helpers/auth.js';

beforeEach(resetDatabase);
afterEach(() => {
  vi.restoreAllMocks();
});

async function rolesOf(email: string): Promise<string[]> {
  const { rows } = await pool.query<{ code: string }>(
    `SELECT r.code
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE u.email = $1
      ORDER BY r.code`,
    [email],
  );
  return rows.map((row) => row.code);
}

describe('login ของนิสิต', () => {
  it('ได้ role student + user และบันทึกรหัสนิสิตกับคณะจากหลักที่ 5-6', async () => {
    const res = await loginWithGoogle(createApp(), { email: '65010999001@msu.ac.th' });

    expect(res.headers.location).toBe(config.webUrl);
    expect(await rolesOf('65010999001@msu.ac.th')).toEqual(['student', 'user']);
    const { rows } = await pool.query(
      `SELECT sp.student_code, ou.code AS faculty_code
         FROM student_profiles sp LEFT JOIN org_units ou ON ou.id = sp.org_unit_id`,
    );
    expect(rows).toEqual([{ student_code: '65010999001', faculty_code: '09' }]);
  });

  it('ไม่เรียก ERP-HR', async () => {
    await loginWithGoogle(createApp(), { email: '65010999001@msu.ac.th' });
    expect(erpHr.fetchStaffInfo).not.toHaveBeenCalled();
  });

  it('รหัสคณะที่ไม่มีในตาราง → login ได้ แต่คณะเป็น NULL', async () => {
    const res = await loginWithGoogle(createApp(), { email: '65016999001@msu.ac.th' });

    expect(sessionCookieOf(res)).toBeTruthy();
    const { rows } = await pool.query('SELECT student_code, org_unit_id FROM student_profiles');
    expect(rows).toEqual([{ student_code: '65016999001', org_unit_id: null }]);
  });

  it('รหัสที่ตรงกับหน่วยงานที่ไม่มีนิสิต (80 สำนักงานอธิการบดี) → คณะเป็น NULL', async () => {
    await loginWithGoogle(createApp(), { email: '65018099001@msu.ac.th' });
    const { rows } = await pool.query('SELECT org_unit_id FROM student_profiles');
    expect(rows).toEqual([{ org_unit_id: null }]);
  });
});

describe('login ของบุคลากร', () => {
  it('ได้ role staff + user และบันทึกข้อมูลจาก ERP-HR โดยส่ง access token ของ Google', async () => {
    await loginWithGoogle(createApp(), { email: 'somchai.j@msu.ac.th' }, { erp: SAMPLE_STAFF_INFO });

    expect(erpHr.fetchStaffInfo).toHaveBeenCalledWith(FAKE_ACCESS_TOKEN);
    expect(await rolesOf('somchai.j@msu.ac.th')).toEqual(['staff', 'user']);
    const { rows } = await pool.query(
      'SELECT staff_code, position_name_th, erp_department_name, synced_at FROM staff_profiles',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      staff_code: '1234567',
      position_name_th: 'นักวิชาการคอมพิวเตอร์',
      erp_department_name: 'กองแผนงาน',
    });
    expect(rows[0].synced_at).toBeInstanceOf(Date);
  });

  it('ERP-HR ล่ม → ยัง login ได้และได้ role staff แต่ไม่มีข้อมูลบุคลากร', async () => {
    const res = await loginWithGoogle(createApp(), { email: 'somchai.j@msu.ac.th' }, { erp: new Error('timeout') });

    expect(sessionCookieOf(res)).toBeTruthy();
    expect(await rolesOf('somchai.j@msu.ac.th')).toEqual(['staff', 'user']);
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM staff_profiles');
    expect(rows[0].count).toBe(0);
  });

  it('ERP-HR ล่มในการ login ครั้งหลัง → ข้อมูลเดิมยังอยู่ และ login ครั้งถัดไปอัปเดตได้', async () => {
    const app = createApp();
    const claims = { sub: 'staff-sub', email: 'somchai.j@msu.ac.th' };
    await loginWithGoogle(app, claims, { erp: SAMPLE_STAFF_INFO });
    await loginWithGoogle(app, claims, { erp: new Error('timeout') });

    let { rows } = await pool.query('SELECT position_name_th FROM staff_profiles');
    expect(rows).toEqual([{ position_name_th: 'นักวิชาการคอมพิวเตอร์' }]);

    await loginWithGoogle(app, claims, { erp: { ...SAMPLE_STAFF_INFO, positionNameTh: 'ผู้อำนวยการกอง' } });
    ({ rows } = await pool.query('SELECT position_name_th FROM staff_profiles'));
    expect(rows).toEqual([{ position_name_th: 'ผู้อำนวยการกอง' }]);
  });

  it('ผู้ใช้เดิมที่ยังไม่มี role staff ได้เพิ่มพร้อม log เมื่อ login ครั้งถัดไป (ไม่ให้ user ซ้ำ)', async () => {
    const app = createApp();
    const claims = { sub: 'staff-sub', email: 'somchai.j@msu.ac.th' };
    await loginWithGoogle(app, claims);
    // จำลองผู้ใช้ที่สร้างก่อนมีฟีเจอร์นี้ (มีแค่ role user)
    await pool.query("DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE code = 'staff')");

    await loginWithGoogle(app, claims);

    expect(await rolesOf('somchai.j@msu.ac.th')).toEqual(['staff', 'user']);
    const { rows } = await pool.query<{ code: string; count: number }>(
      `SELECT r.code, count(*)::int AS count
         FROM role_change_logs l JOIN roles r ON r.id = l.role_id
        GROUP BY r.code ORDER BY r.code`,
    );
    expect(rows).toEqual([
      { code: 'staff', count: 2 },
      { code: 'user', count: 1 },
    ]);
  });
});

describe('GET /auth/me คืนข้อมูลนิสิต/บุคลากร', () => {
  async function me(res: Awaited<ReturnType<typeof loginWithGoogle>>, app: ReturnType<typeof createApp>) {
    const cookie = sessionCookieOf(res)!;
    return request(app).get('/auth/me').set('Cookie', cookie);
  }

  it('นิสิต', async () => {
    const app = createApp();
    const res = await me(await loginWithGoogle(app, { email: '65010999001@msu.ac.th' }), app);
    expect(res.body.profile).toEqual({
      type: 'student',
      student: { studentCode: '65010999001', faculty: { code: '09', nameTh: 'คณะการบัญชีและการจัดการ' } },
    });
  });

  it('บุคลากร (ชื่อเต็มแบบไทย: คำนำหน้าติดชื่อ)', async () => {
    const app = createApp();
    const res = await me(await loginWithGoogle(app, { email: 'somchai.j@msu.ac.th' }, { erp: SAMPLE_STAFF_INFO }), app);
    expect(res.body.profile).toMatchObject({
      type: 'staff',
      staff: {
        staffCode: '1234567',
        fullNameTh: 'นายสมชาย ใจดี',
        positionNameTh: 'นักวิชาการคอมพิวเตอร์',
        facultyName: 'สำนักงานอธิการบดี',
        departmentName: 'กองแผนงาน',
      },
    });
  });

  it('บุคลากรที่ไม่มีคำนำหน้า ชื่อไม่หาย', async () => {
    const app = createApp();
    const res = await me(
      await loginWithGoogle(app, { email: 'somchai.j@msu.ac.th' }, { erp: { ...SAMPLE_STAFF_INFO, prefixNameTh: null } }),
      app,
    );
    expect(res.body.profile.staff.fullNameTh).toBe('สมชาย ใจดี');
  });

  it('บุคลากรที่ยังดึง ERP ไม่สำเร็จ → staff เป็น null', async () => {
    const app = createApp();
    const res = await me(await loginWithGoogle(app, { email: 'somchai.j@msu.ac.th' }, { erp: new Error('x') }), app);
    expect(res.body.profile).toEqual({ type: 'staff', staff: null });
  });
});
