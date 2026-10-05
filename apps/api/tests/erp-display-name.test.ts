import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resetDatabase } from './helpers/db.js';
import { loginWithGoogle, SAMPLE_STAFF_INFO, sessionCookieOf } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);
afterEach(() => {
  vi.restoreAllMocks();
});

const STAFF = { sub: 'staff-sub', email: 'somchai.j@msu.ac.th' };
const nameRow = async () => (await pool.query('SELECT name, google_name FROM users WHERE google_sub = $1', [STAFF.sub])).rows[0];

describe('ชื่อแสดงในระบบใช้ชื่อตาม ERP-HR', () => {
  it('บุคลากร: ชื่อแสดง = ชื่อ นามสกุล จาก ERP (ไม่มีคำนำหน้า) แม้ชื่อใน Google ต่างกัน และเก็บชื่อ Google ไว้แยก', async () => {
    const res = await loginWithGoogle(createApp(), { ...STAFF, name: 'Somchai J. (ตั้งเอง)' }, { erp: SAMPLE_STAFF_INFO });
    expect(res.status).toBe(302);
    expect(await nameRow()).toEqual({ name: 'สมชาย ใจดี', google_name: 'Somchai J. (ตั้งเอง)' });
    // /auth/me ใช้ชื่อเดียวกัน
    const me = await request(createApp()).get('/auth/me').set('Cookie', sessionCookieOf(res)!);
    expect(me.body.user.name).toBe('สมชาย ใจดี');
  });

  it('ERP เปลี่ยนชื่อ (เช่น เปลี่ยนนามสกุล) → ชื่อแสดงเปลี่ยนตามตอน login ครั้งถัดไป', async () => {
    const app = createApp();
    await loginWithGoogle(app, STAFF, { erp: SAMPLE_STAFF_INFO });
    await loginWithGoogle(app, STAFF, { erp: { ...SAMPLE_STAFF_INFO, lastNameTh: 'ใจงาม' } });
    expect((await nameRow()).name).toBe('สมชาย ใจงาม');
  });

  it('ERP ล่ม/ไม่ตอบรอบนี้ แต่เคยมีชื่อจาก ERP → คงชื่อเดิม ไม่ใช้ชื่อ Google ทับ', async () => {
    const app = createApp();
    await loginWithGoogle(app, STAFF, { erp: SAMPLE_STAFF_INFO });
    await loginWithGoogle(app, { ...STAFF, name: 'ชื่อแก้ใน Google' }, { erp: new Error('ERP timeout') });
    expect(await nameRow()).toEqual({ name: 'สมชาย ใจดี', google_name: 'ชื่อแก้ใน Google' });
    await loginWithGoogle(app, { ...STAFF, name: 'ชื่อแก้อีก' }, { erp: null });
    expect((await nameRow()).name).toBe('สมชาย ใจดี');
  });

  it('ไม่มีข้อมูล ERP / ข้อมูลชื่อไม่ครบ / นิสิต → ใช้ชื่อจาก Google', async () => {
    const app = createApp();
    await loginWithGoogle(app, { ...STAFF, name: 'ชื่อ Google' }, { erp: null });
    expect((await nameRow()).name).toBe('ชื่อ Google');
    await loginWithGoogle(app, { ...STAFF, name: 'ชื่อ Google 2' }, { erp: { ...SAMPLE_STAFF_INFO, lastNameTh: '  ' } });
    expect((await nameRow()).name).toBe('ชื่อ Google 2');

    await loginWithGoogle(app, { sub: 'student-sub', email: '65010999001@msu.ac.th', name: 'นิสิต ทดสอบ' });
    const { rows } = await pool.query("SELECT name FROM users WHERE google_sub = 'student-sub'");
    expect(rows[0].name).toBe('นิสิต ทดสอบ');
  });
});

describe('ชื่อแบบทางการสำหรับเอกสารพิมพ์ (user_formal_name)', () => {
  it('คำนำหน้าจาก ERP ต่อด้วยชื่อโดยไม่เว้นวรรค; ไม่มีคำนำหน้า = ชื่อแสดง', async () => {
    const app = createApp();
    await loginWithGoogle(app, STAFF, { erp: { ...SAMPLE_STAFF_INFO, prefixNameTh: 'นางสาว', firstNameTh: 'สมหญิง', lastNameTh: 'ตัวอย่าง' } });
    await loginWithGoogle(app, { sub: 'other', email: 'other@msu.ac.th', name: 'ไม่มี ERP' }, { erp: null });
    const { rows } = await pool.query(
      `SELECT google_sub, user_formal_name(id) AS formal FROM users ORDER BY google_sub`,
    );
    expect(rows).toEqual([
      { google_sub: 'other', formal: 'ไม่มี ERP' },
      { google_sub: 'staff-sub', formal: 'นางสาวสมหญิง ตัวอย่าง' },
    ]);
  });
});
