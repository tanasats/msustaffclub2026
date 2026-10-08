import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, loginWithGoogle, SAMPLE_STAFF_INFO, sessionCookieOf, WEB_ORIGIN } from './helpers/auth.js';
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
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2 ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

const post = (who: Actor, path: string, body: object) => request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const put = (who: Actor, path: string, body: object) => request(app).put(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function orgUnitId(code: string): Promise<string> {
  return (await pool.query<{ id: string }>('SELECT id FROM org_units WHERE code = $1', [code])).rows[0]!.id;
}

async function input(overrides: object = {}) {
  return {
    email: 'Senior.Prof@MSU.ac.th',
    prefixNameTh: 'ศาสตราจารย์ ดร.',
    firstNameTh: 'อาวุโส',
    lastNameTh: 'ใจกว้าง',
    prefixNameEn: 'Prof. Dr.',
    firstNameEn: 'Awuso',
    lastNameEn: 'Jaikwang',
    orgUnitId: await orgUnitId('82'),
    positionNameTh: 'อาจารย์',
    ...overrides,
  };
}

describe('super_admin เพิ่มบุคลากรล่วงหน้า (user_account:create)', () => {
  it('เพิ่มแล้วได้บัญชีที่ยังไม่ผูก + role user/staff (มี log) + ข้อมูลบุคลากร และค้นเจอเพื่อเลือกเป็นกรรมการ/ที่ปรึกษาได้', async () => {
    const admin = await actor(['user', 'super_admin']);
    const res = await post(admin, '/provisioned-users', await input());
    expect(res.status).toBe(201);
    const id = res.body.id;

    const { rows: users } = await pool.query('SELECT email, name, google_sub, created_by FROM users WHERE id = $1', [id]);
    expect(users[0]).toEqual({ email: 'senior.prof@msu.ac.th', name: 'อาวุโส ใจกว้าง', google_sub: null, created_by: admin.id });
    const { rows: roles } = await pool.query(
      `SELECT r.code, ur.granted_by FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.code`,
      [id],
    );
    expect(roles).toEqual([{ code: 'staff', granted_by: admin.id }, { code: 'user', granted_by: admin.id }]);
    expect((await pool.query('SELECT 1 FROM role_change_logs WHERE target_user_id = $1', [id])).rowCount).toBe(2);
    expect((await pool.query("SELECT source, staff_code FROM staff_profiles WHERE user_id = $1", [id])).rows[0]).toEqual({ source: 'admin', staff_code: null });
    expect((await pool.query('SELECT user_formal_name($1) AS n', [id])).rows[0].n).toBe('ศาสตราจารย์ ดร.อาวุโส ใจกว้าง');

    const staff = await actor(['user', 'staff']);
    const found = (await get(staff, '/users/search?q=อาวุโส')).body.items;
    expect(found).toMatchObject([{ id, name: 'อาวุโส ใจกว้าง', orgUnitName: 'กองแผนงาน', hasLoggedIn: false }]);
    expect((await get(admin, `/provisioned-users/${id}`)).body).toMatchObject({ firstNameEn: 'Awuso', positionNameTh: 'อาจารย์' });
  });

  it('ปฏิเสธ: อีเมลซ้ำ / อีเมลนิสิตหรือนอกโดเมน / หน่วยงานไม่มีอยู่', async () => {
    const admin = await actor(['user', 'super_admin']);
    await post(admin, '/provisioned-users', await input());
    expect((await post(admin, '/provisioned-users', await input())).body.error.code).toBe('USER_EXISTS');
    await createTestUser({ email: 'already.here@msu.ac.th' });
    expect((await post(admin, '/provisioned-users', await input({ email: 'already.here@msu.ac.th' }))).body.error.code).toBe('USER_EXISTS');
    expect((await post(admin, '/provisioned-users', await input({ email: '65010999001@msu.ac.th' }))).body.error.code).toBe('EMAIL_NOT_ELIGIBLE');
    expect((await post(admin, '/provisioned-users', await input({ email: 'someone@gmail.com' }))).body.error.code).toBe('EMAIL_NOT_ELIGIBLE');
    expect((await post(admin, '/provisioned-users', await input({ email: 'new.person@msu.ac.th', orgUnitId: '01900000-0000-7000-8000-000000000000' }))).body.error.code).toBe('ORG_UNIT_NOT_FOUND');
  });

  it('แก้ข้อมูลได้เฉพาะบัญชีที่ยังไม่ผูก', async () => {
    const admin = await actor(['user', 'super_admin']);
    const { id } = (await post(admin, '/provisioned-users', await input())).body;
    expect((await put(admin, `/provisioned-users/${id}`, await input({ lastNameTh: 'ใจดี' }))).status).toBe(204);
    expect((await pool.query('SELECT name FROM users WHERE id = $1', [id])).rows[0].name).toBe('อาวุโส ใจดี');
    const linked = await createTestUser({ email: 'linked@msu.ac.th' });
    expect((await put(admin, `/provisioned-users/${linked.id}`, await input({ email: 'linked@msu.ac.th' }))).body.error.code).toBe('ACCOUNT_LINKED');
  });

  it('ไม่มี permission (รวมผู้มี user_role:assign) → 403; ผู้ถือ role ที่ผูก user_account:create ทำได้', async () => {
    const roleAdmin = await actor(['user', 'staff', await roleWith('user_role:assign')]);
    expect((await post(roleAdmin, '/provisioned-users', await input())).status).toBe(403);
    const creator = await actor(['user', 'staff', await roleWith('user_account:create')]);
    expect((await post(creator, '/provisioned-users', await input())).status).toBe(201);
  });
});

describe('เจ้าตัว login ครั้งแรก → ผูกกับบัญชีที่เพิ่มไว้', () => {
  it('ใช้บัญชีเดิม (ไม่สร้างใหม่) ข้อมูล ERP แทนข้อมูลที่กรอก และบันทึกประวัติ linked', async () => {
    const admin = await actor(['user', 'super_admin']);
    const { id } = (await post(admin, '/provisioned-users', await input())).body;
    const res = await loginWithGoogle(createApp(), { sub: 'g-senior', email: 'senior.prof@msu.ac.th', name: 'Prof A' }, { erp: SAMPLE_STAFF_INFO });
    expect(res.status).toBe(302);
    expect(sessionCookieOf(res)).toBeTruthy();

    const { rows } = await pool.query("SELECT id, google_sub, name, google_name FROM users WHERE email = 'senior.prof@msu.ac.th'");
    expect(rows).toEqual([{ id, google_sub: 'g-senior', name: 'สมชาย ใจดี', google_name: 'Prof A' }]);
    expect((await pool.query('SELECT source, staff_code FROM staff_profiles WHERE user_id = $1', [id])).rows[0]).toEqual({ source: 'erp', staff_code: '1234567' });
    expect((await pool.query("SELECT action FROM user_account_events WHERE user_id = $1 ORDER BY created_at", [id])).rows.map((r) => r.action)).toEqual([
      'created',
      'linked',
    ]);
  });

  it('ERP ไม่ตอบตอนผูก → คงชื่อที่ผู้ดูแลกรอกไว้', async () => {
    const admin = await actor(['user', 'super_admin']);
    await post(admin, '/provisioned-users', await input());
    await loginWithGoogle(createApp(), { sub: 'g-senior', email: 'senior.prof@msu.ac.th', name: 'Prof A' }, { erp: null });
    expect((await pool.query("SELECT name FROM users WHERE google_sub = 'g-senior'")).rows[0].name).toBe('อาวุโส ใจกว้าง');
  });

  it('บัญชีที่รอผูกถูกปิดใช้งาน → login ไม่ได้ และไม่สร้างบัญชีใหม่แทน', async () => {
    const admin = await actor(['user', 'super_admin']);
    const { id } = (await post(admin, '/provisioned-users', await input())).body;
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [id]);
    const res = await loginWithGoogle(createApp(), { sub: 'g-senior', email: 'senior.prof@msu.ac.th' }, { erp: null });
    expect(res.headers.location).toContain('error=account_disabled');
    expect((await pool.query("SELECT 1 FROM users WHERE email = 'senior.prof@msu.ac.th'")).rowCount).toBe(1);
  });

  it('บัญชีที่ผูกแล้วไม่ถูกยึด: Google คนละบัญชีที่ใช้อีเมลเดียวกันได้บัญชีใหม่', async () => {
    const admin = await actor(['user', 'super_admin']);
    const { id } = (await post(admin, '/provisioned-users', await input())).body;
    await loginWithGoogle(createApp(), { sub: 'g-first', email: 'senior.prof@msu.ac.th' }, { erp: null });
    await loginWithGoogle(createApp(), { sub: 'g-second', email: 'senior.prof@msu.ac.th' }, { erp: null });
    const { rows } = await pool.query("SELECT id, google_sub FROM users WHERE email = 'senior.prof@msu.ac.th' ORDER BY created_at");
    expect(rows[0]).toEqual({ id, google_sub: 'g-first' });
    expect(rows[1].google_sub).toBe('g-second');
  });
});
