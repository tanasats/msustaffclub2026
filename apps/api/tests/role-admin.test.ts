import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { resolveSession } from '../src/services/auth-service.js';
import { revokeRole } from '../src/services/role-admin-service.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff'], email?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  for (const role of roles) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

// ผู้ใช้ที่มี user_role:assign (แต่ไม่ใช่ super_admin)
async function assigner(): Promise<Actor> {
  await pool.query("INSERT INTO roles (code, name_th) VALUES ('test_assigner', 'ผู้ให้สิทธิ์') ON CONFLICT DO NOTHING");
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'test_assigner' AND p.code = 'user_role:assign'
     ON CONFLICT DO NOTHING`,
  );
  return actor(['user', 'staff', 'test_assigner']);
}

async function testRole(code = 'test_helper'): Promise<string> {
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT DO NOTHING', [code]);
  return code;
}

function get(who: Actor, path: string) {
  return request(app).get(path).set('Cookie', who.cookie);
}

function grant(who: Actor, userId: string, roleCode: string, reason = 'ได้รับมอบหมาย') {
  return request(app)
    .post(`/admin/users/${userId}/roles`)
    .set('Cookie', who.cookie)
    .set('Origin', WEB_ORIGIN)
    .send({ roleCode, reason });
}

function revoke(who: Actor, userId: string, roleCode: string, reason = 'พ้นหน้าที่') {
  return request(app)
    .post(`/admin/users/${userId}/roles/${roleCode}/revoke`)
    .set('Cookie', who.cookie)
    .set('Origin', WEB_ORIGIN)
    .send({ reason });
}

async function rolesOf(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ code: string }>(
    'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.code',
    [userId],
  );
  return rows.map((r) => r.code);
}

describe('สิทธิ์เข้าถึง /admin', () => {
  it('ไม่มี user_role:assign → 403, ไม่ login → 401, super_admin และผู้มี user_role:assign → 200', async () => {
    expect((await request(app).get('/admin/roles')).status).toBe(401);
    expect((await get(await actor(), '/admin/roles')).status).toBe(403);
    expect((await get(await actor(['user', 'super_admin']), '/admin/roles')).status).toBe(200);
    expect((await get(await assigner(), '/admin/roles')).status).toBe(200);
  });

  it('GET /admin/roles บอกว่าผู้ใช้ปัจจุบันให้ role ไหนได้', async () => {
    await testRole();
    const { items } = (await get(await assigner(), '/admin/roles')).body;
    const grantable = Object.fromEntries(items.map((r: { code: string; grantable: boolean }) => [r.code, r.grantable]));
    expect(grantable).toMatchObject({
      super_admin: false,
      club_officer: false,
      club_president: false,
      sport_selection_committee: false,
      user: false,
      staff: false,
      test_helper: true,
    });
  });
});

describe('ให้ role', () => {
  it('super_admin ให้ role สิทธิ์สูง (เจ้าหน้าที่สโมสร) ได้ พร้อม log และมีผลทันที', async () => {
    const admin = await actor(['user', 'super_admin']);
    const target = await actor();

    const res = await grant(admin, target.id, 'club_officer', 'แต่งตั้งตามคำสั่งที่ 1/2569');

    expect(res.status).toBe(204);
    expect(await rolesOf(target.id)).toEqual(['club_officer', 'staff', 'user']);
    const { rows } = await pool.query(
      `SELECT l.action, l.reason, l.actor_user_id, r.code FROM role_change_logs l JOIN roles r ON r.id = l.role_id
        WHERE l.target_user_id = $1`,
      [target.id],
    );
    expect(rows).toEqual([
      { action: 'grant', reason: 'แต่งตั้งตามคำสั่งที่ 1/2569', actor_user_id: admin.id, code: 'club_officer' },
    ]);
    const { rows: granted } = await pool.query('SELECT granted_by FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = $1', ['club_officer']);
    expect(granted[0].granted_by).toBe(admin.id);

    // สิทธิ์ใหม่มีผลทันทีโดยไม่ต้อง login ใหม่
    const session = await resolveSession(target.cookie.split('=')[1]!);
    expect(session?.permissions).toContain('club_application:review');
  });

  it('ผู้มี user_role:assign ให้ role ทั่วไปได้ แต่ role สิทธิ์สูงไม่ได้', async () => {
    const who = await assigner();
    const target = await actor();
    await testRole();
    expect((await grant(who, target.id, 'test_helper')).status).toBe(204);

    for (const code of ['club_officer', 'club_president', 'sport_selection_committee', 'super_admin']) {
      const res = await grant(who, target.id, code);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUPER_ADMIN_ONLY');
    }
  });

  it('role ที่ระบบให้อัตโนมัติ (user/student/staff) ให้ด้วยมือไม่ได้', async () => {
    const admin = await actor(['user', 'super_admin']);
    const target = await actor(['user']);
    for (const code of ['user', 'staff', 'student']) {
      const res = await grant(admin, target.id, code);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ROLE_AUTO_ASSIGNED');
    }
  });

  it('ห้ามให้ role แก่ตนเอง', async () => {
    const admin = await actor(['user', 'super_admin']);
    const res = await grant(admin, admin.id, 'club_officer');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLES');
  });

  it('ผู้ใช้ไม่พบ / ถูกปิดบัญชี / role ไม่พบ / มีอยู่แล้ว / ไม่ระบุเหตุผล', async () => {
    const admin = await actor(['user', 'super_admin']);
    const target = await actor();
    const inactive = await createTestUser({ isActive: false });

    expect((await grant(admin, '01900000-0000-7000-8000-000000000000', 'club_officer')).status).toBe(404);
    expect((await grant(admin, inactive.id, 'club_officer')).body.error.code).toBe('USER_INACTIVE');
    expect((await grant(admin, target.id, 'no_such_role')).body.error.code).toBe('ROLE_NOT_FOUND');
    await grant(admin, target.id, 'club_officer');
    expect((await grant(admin, target.id, 'club_officer')).body.error.code).toBe('ROLE_ALREADY_GRANTED');
    expect((await grant(admin, target.id, 'club_president', '   ')).status).toBe(400);
  });
});

describe('ถอน role', () => {
  it('super_admin ถอน role ได้ พร้อม log และสิทธิ์หายทันที', async () => {
    const admin = await actor(['user', 'super_admin']);
    const target = await actor();
    await grant(admin, target.id, 'club_president');

    expect((await revoke(admin, target.id, 'club_president', 'ครบวาระ')).status).toBe(204);

    expect(await rolesOf(target.id)).toEqual(['staff', 'user']);
    const history = (await get(admin, `/admin/users/${target.id}`)).body.history;
    expect(history.map((h: { action: string; reason: string }) => [h.action, h.reason])).toEqual([
      ['revoke', 'ครบวาระ'],
      ['grant', 'ได้รับมอบหมาย'],
    ]);
    const session = await resolveSession(target.cookie.split('=')[1]!);
    expect(session?.permissions).not.toContain('club_application:approve');
  });

  it('ถอน role user ไม่ได้, ถอน role ที่ไม่มีไม่ได้, ผู้มี user_role:assign ถอน role สิทธิ์สูงไม่ได้', async () => {
    const admin = await actor(['user', 'super_admin']);
    const who = await assigner();
    const target = await actor();
    await grant(admin, target.id, 'club_officer');

    expect((await revoke(admin, target.id, 'user')).body.error.code).toBe('ROLE_AUTO_ASSIGNED');
    expect((await revoke(admin, target.id, 'club_president')).body.error.code).toBe('ROLE_NOT_HELD');
    expect((await revoke(who, target.id, 'club_officer')).body.error.code).toBe('SUPER_ADMIN_ONLY');
    expect(await rolesOf(target.id)).toContain('club_officer');
  });

  it('super_admin ถอน super_admin คนอื่นได้ แต่ถอนตัวเองไม่ได้', async () => {
    const admin1 = await actor(['user', 'super_admin']);
    const admin2 = await actor(['user', 'super_admin']);
    expect((await revoke(admin1, admin1.id, 'super_admin')).body.error.code).toBe('CANNOT_CHANGE_OWN_ROLES');
    expect((await revoke(admin1, admin2.id, 'super_admin')).status).toBe(204);
  });

  it('ห้ามถอน super_admin คนสุดท้ายที่ใช้งานได้ (rollback ทั้งหมด)', async () => {
    // super_admin ในฐานข้อมูลมีคนเดียว ส่วนผู้กระทำเป็น AuthContext ที่ถือ role super_admin
    // (สถานการณ์นี้ปกติเกิดไม่ได้เพราะห้ามถอนตัวเอง จึงทดสอบที่ service โดยตรงเพื่อยืนยันการป้องกันชั้นที่สอง)
    const onlyAdmin = await actor(['user', 'super_admin']);
    const other = await createTestUser();
    const forgedActor = {
      sessionId: 'x',
      user: { id: other.id, email: other.email, name: null, pictureUrl: null },
      roles: ['super_admin'],
      permissions: [],
    };

    await expect(revokeRole(forgedActor, onlyAdmin.id, 'super_admin', 'ทดสอบ')).rejects.toMatchObject({
      code: 'LAST_SUPER_ADMIN',
    });
    expect(await rolesOf(onlyAdmin.id)).toContain('super_admin');
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM role_change_logs WHERE action = 'revoke'");
    expect(rows[0].n).toBe(0);
  });
});

describe('รายชื่อผู้ใช้', () => {
  it('ค้นหา + แบ่งหน้า + แสดง role (รวมผู้ที่ถูกปิดบัญชี)', async () => {
    const admin = await actor(['user', 'super_admin'], 'admin.x@msu.ac.th');
    for (let i = 1; i <= 3; i += 1) {
      const u = await createTestUser({ email: `somchai${i}@msu.ac.th`, isActive: i !== 3 });
      await pool.query("UPDATE users SET name = $2 WHERE id = $1", [u.id, `สมชาย ${i}`]);
    }

    const page1 = (await get(admin, '/admin/users?q=สมชาย&pageSize=2')).body;
    expect(page1.total).toBe(3);
    expect(page1.items.map((u: { name: string }) => u.name)).toEqual(['สมชาย 1', 'สมชาย 2']);
    const page2 = (await get(admin, '/admin/users?q=สมชาย&pageSize=2&page=2')).body;
    expect(page2.items).toMatchObject([{ name: 'สมชาย 3', isActive: false }]);

    const all = (await get(admin, '/admin/users?q=admin.x')).body;
    expect(all.items[0].roles).toEqual(['super_admin', 'user']);
  });

  it('รายละเอียดผู้ใช้: ไม่พบ → 404', async () => {
    const admin = await actor(['user', 'super_admin']);
    expect((await get(admin, '/admin/users/not-a-uuid')).status).toBe(404);
  });
});
