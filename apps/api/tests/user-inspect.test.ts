import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { LOGIN_EVENT_RETENTION_DAYS, purgeOldLoginEvents } from '../src/services/login-history-service.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, loginWithGoogle, SAMPLE_STAFF_INFO, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);
afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(roles: string[]): Promise<Actor> {
  const user = await createTestUser();
  for (const role of roles) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.code = $1 AND p.code = $2 ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const put = (who: Actor, path: string, body: object) => request(app).put(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);

// บุคลากรที่ ERP ไม่มีอีเมล → ชื่อในระบบเป็นชื่อ Google (อังกฤษ/ตัวย่อ)
const STAFF = { sub: 'staff-sub', email: 'somchai.j@msu.ac.th', name: 'Somchai J.' };

async function userIdOf(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return rows[0]!.id;
}

async function displayName(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ name: string | null }>('SELECT name FROM users WHERE id = $1', [userId]);
  return rows[0]!.name;
}

async function orgUnitId(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM org_units WHERE code = $1', [code]);
  return rows[0]!.id;
}

describe('ข้อมูลผู้ใช้แบบเต็ม (GET /user-accounts/:userId/data — user_account:inspect)', () => {
  it('super_admin / ผู้ถือ user_account:inspect ดูได้ครบ; บุคลากร และผู้มีแค่ user_role:assign 403; ไม่ login 401; ไม่พบ 404', async () => {
    await loginWithGoogle(app, STAFF, { erp: SAMPLE_STAFF_INFO });
    const target = await userIdOf(STAFF.email);
    const admin = await actor(['user', 'super_admin']);
    const inspector = await actor(['user', await roleWith('user_account:inspect')]);
    const assigner = await actor(['user', await roleWith('user_role:assign')]);
    const staff = await actor(['user', 'staff']);

    const res = await get(admin, `/user-accounts/${target}/data`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.account).toMatchObject({
      email: STAFF.email,
      name: 'สมชาย ใจดี',
      googleName: 'Somchai J.',
      hasLinkedGoogle: true,
      isActive: true,
      createdByName: null,
      emailNotifications: true,
    });
    // ไม่เปิดเผยรหัสบัญชี Google
    expect(JSON.stringify(res.body)).not.toContain('staff-sub');
    expect(res.body.staffProfile).toMatchObject({
      source: 'erp',
      staffCode: '1234567',
      erpDepartmentId: '201092704000',
      departmentName: 'กองแผนงาน',
      orgUnitName: 'กองแผนงาน',
    });
    expect(res.body.loginEvents).toMatchObject([{ erpResult: 'ok' }]);

    expect((await get(inspector, `/user-accounts/${target}/data`)).status).toBe(200);
    expect((await get(assigner, `/user-accounts/${target}/data`)).status).toBe(403);
    expect((await get(staff, `/user-accounts/${target}/data`)).status).toBe(403);
    expect((await request(app).get(`/user-accounts/${target}/data`)).status).toBe(401);
    expect((await get(admin, '/user-accounts/01900000-0000-7000-8000-000000000000/data')).status).toBe(404);
  });
});

describe('ประวัติการเข้าระบบและผลการดึง ERP (login_events)', () => {
  it('บันทึกทุกครั้งที่ login: ERP ok / ไม่พบ / ขัดข้อง; นิสิตไม่ได้เรียก ERP (null) — ใหม่สุดก่อน และอยู่ใน /me/data ของตัวเอง', async () => {
    await loginWithGoogle(app, STAFF, { erp: SAMPLE_STAFF_INFO });
    await loginWithGoogle(app, STAFF, { erp: null });
    await loginWithGoogle(app, STAFF, { erp: new Error('ERP timeout') });
    await loginWithGoogle(app, { sub: 'student-sub', email: '65011212345@msu.ac.th' });
    const admin = await actor(['user', 'super_admin']);

    const staffEvents = (await get(admin, `/user-accounts/${await userIdOf(STAFF.email)}/data`)).body.loginEvents;
    expect(staffEvents.map((e: { erpResult: string }) => e.erpResult)).toEqual(['error', 'not_found', 'ok']);
    const studentId = await userIdOf('65011212345@msu.ac.th');
    expect((await get(admin, `/user-accounts/${studentId}/data`)).body.loginEvents).toMatchObject([{ erpResult: null }]);

    const me = { id: studentId, cookie: await createSessionCookie(studentId) };
    expect((await get(me, '/me/data')).body.loginEvents).toHaveLength(1);
  });

  it(`ลบประวัติที่เก่ากว่า ${LOGIN_EVENT_RETENTION_DAYS} วัน; แก้ไขแถวไม่ได้; ค่าผล ERP นอกรายการถูกปฏิเสธ`, async () => {
    const user = await createTestUser();
    await pool.query(
      `INSERT INTO login_events (user_id, erp_result, created_at) VALUES ($1, 'ok', now() - make_interval(days => $2::int + 1)), ($1, 'ok', now())`,
      [user.id, LOGIN_EVENT_RETENTION_DAYS],
    );
    expect(await purgeOldLoginEvents()).toBe(1);
    await expect(pool.query("UPDATE login_events SET erp_result = 'error' WHERE user_id = $1", [user.id])).rejects.toThrow();
    await expect(pool.query("INSERT INTO login_events (user_id, erp_result) VALUES ($1, 'maybe')", [user.id])).rejects.toThrow(
      /login_events_erp_result_check/,
    );
  });
});

describe('บันทึกข้อมูลบุคลากรแทน ERP (PUT /user-accounts/:userId/staff-profile — user_account:create)', () => {
  const profile = async () => ({
    prefixNameTh: 'นาย',
    firstNameTh: 'สมชาย',
    lastNameTh: 'ใจดี',
    prefixNameEn: 'Mr.',
    firstNameEn: 'Somchai',
    lastNameEn: 'Jaidee',
    orgUnitId: await orgUnitId('82'),
    positionNameTh: 'นักวิชาการคอมพิวเตอร์',
  });

  it('ERP ไม่พบ → ผู้ดูแลบันทึกชื่อไทย/หน่วยงานแทน; login ครั้งถัดไป ERP ยังไม่พบ ชื่อคงเดิม; ERP มีข้อมูลแล้วใช้ข้อมูล ERP แทนและแก้ที่นี่ไม่ได้อีก', async () => {
    await loginWithGoogle(app, STAFF, { erp: null });
    const target = await userIdOf(STAFF.email);
    expect(await displayName(target)).toBe('Somchai J.');
    const admin = await actor(['user', 'super_admin']);

    expect((await get(admin, `/user-accounts/${target}/staff-profile`)).body).toMatchObject({ editable: true, profile: { source: null } });
    expect((await put(admin, `/user-accounts/${target}/staff-profile`, await profile())).status).toBe(204);
    expect(await displayName(target)).toBe('สมชาย ใจดี');
    const data = (await get(admin, `/user-accounts/${target}/data`)).body;
    expect(data.staffProfile).toMatchObject({ source: 'admin', staffCode: null, orgUnitName: 'กองแผนงาน', firstNameEn: 'Somchai' });
    const { rows: events } = await pool.query("SELECT action, reason FROM user_account_events WHERE user_id = $1", [target]);
    expect(events).toMatchObject([{ action: 'updated', reason: expect.stringContaining('แทน ERP') }]);

    // แก้ซ้ำได้ระหว่างที่ยังไม่มีข้อมูล ERP
    expect((await put(admin, `/user-accounts/${target}/staff-profile`, { ...(await profile()), positionNameTh: 'ผู้อำนวยการกอง' })).status).toBe(204);

    await loginWithGoogle(app, STAFF, { erp: null });
    expect(await displayName(target)).toBe('สมชาย ใจดี');

    await loginWithGoogle(app, STAFF, { erp: { ...SAMPLE_STAFF_INFO, firstNameTh: 'สมชาย', lastNameTh: 'ใจดีมาก' } });
    expect(await displayName(target)).toBe('สมชาย ใจดีมาก');
    expect((await get(admin, `/user-accounts/${target}/data`)).body.staffProfile).toMatchObject({ source: 'erp', staffCode: '1234567' });
    expect((await get(admin, `/user-accounts/${target}/staff-profile`)).body.editable).toBe(false);
    const blocked = await put(admin, `/user-accounts/${target}/staff-profile`, await profile());
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ERP_PROFILE_EXISTS');
    expect(await displayName(target)).toBe('สมชาย ใจดีมาก');
  });

  it('บัญชีนิสิต 422; หน่วยงานไม่มี 422; ข้อมูลไม่ครบ/มีอีเมล 400; ผู้ถือ user_account:create ทำได้ บุคลากรทั่วไป 403', async () => {
    await loginWithGoogle(app, { sub: 'student-sub', email: '65011212345@msu.ac.th' });
    await loginWithGoogle(app, STAFF, { erp: null });
    const student = await userIdOf('65011212345@msu.ac.th');
    const target = await userIdOf(STAFF.email);
    const admin = await actor(['user', 'super_admin']);
    const creator = await actor(['user', await roleWith('user_account:create')]);
    const staff = await actor(['user', 'staff']);

    expect((await put(admin, `/user-accounts/${student}/staff-profile`, await profile())).body.error.code).toBe('NOT_STAFF_ACCOUNT');
    expect((await get(admin, `/user-accounts/${student}/staff-profile`)).body.editable).toBe(false);
    expect(
      (await put(admin, `/user-accounts/${target}/staff-profile`, { ...(await profile()), orgUnitId: '01900000-0000-7000-8000-000000000000' })).body.error
        .code,
    ).toBe('ORG_UNIT_NOT_FOUND');
    expect((await put(admin, `/user-accounts/${target}/staff-profile`, { ...(await profile()), firstNameTh: '' })).status).toBe(400);
    expect((await put(admin, `/user-accounts/${target}/staff-profile`, { ...(await profile()), email: 'x@msu.ac.th' })).status).toBe(400);

    expect((await put(staff, `/user-accounts/${target}/staff-profile`, await profile())).status).toBe(403);
    expect((await put(creator, `/user-accounts/${target}/staff-profile`, await profile())).status).toBe(204);
  });
});
