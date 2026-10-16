import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { getClubPermissions } from '../src/services/club-authorization.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';
import { resolveSession } from '../src/services/auth-service.js';

beforeEach(resetDatabase);

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

async function testRole(code: string, permissions: string[] = []): Promise<string> {
  await pool.query("INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING", [code]);
  for (const permission of permissions) {
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2
       ON CONFLICT DO NOTHING`,
      [code, permission],
    );
  }
  return code;
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const post = (who: Actor, path: string, body: object) => request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const patch = (who: Actor, path: string, body: object) => request(app).patch(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);

async function logActions(): Promise<string[]> {
  const { rows } = await pool.query<{ action: string }>('SELECT action FROM permission_change_logs ORDER BY created_at, id');
  return rows.map((r) => r.action);
}

describe('ภาพรวมสิทธิ์ในระบบ (role_permission:manage)', () => {
  it('super_admin เห็นทุกสิทธิ์พร้อมคำอธิบาย role ที่ได้ และจำนวนผู้ถือ; ผู้มีแค่ user_role:assign / บุคลากร 403; ไม่ login 401', async () => {
    const admin = await actor(['user', 'super_admin']);
    const officer = await actor(['user', 'staff', 'club_committee']);
    const assigner = await actor(['user', await testRole('test_assigner', ['user_role:assign'])]);
    const staff = await actor(['user', 'staff']);

    const res = await get(admin, '/admin/permissions');
    expect(res.status).toBe(200);
    const announce = res.body.permissions.find((p: { code: string }) => p.code === 'staff_announcement:send');
    expect(announce.descriptionTh).toContain('ส่งประกาศ');
    expect(announce.roles.map((r: { code: string }) => r.code)).toEqual(['club_committee', 'club_president']);
    expect(announce.holderCount).toBe(1);
    expect(res.body.superAdminCount).toBe(1);
    expect(res.body.clubPositions.find((p: { code: string }) => p.code === 'treasurer').permissions).toContain('club_finance:manage');
    expect(res.body.clubPermissions.length).toBeGreaterThan(5);

    const holders = (await get(admin, '/admin/permissions/staff_announcement:send/holders')).body;
    expect(holders.holders).toMatchObject([{ id: officer.id, roles: ['กรรมการสโมสร'] }]);
    expect((await get(admin, '/admin/permissions/nope:nope/holders')).status).toBe(404);

    expect((await get(assigner, '/admin/permissions')).status).toBe(403);
    expect((await get(staff, '/admin/permissions')).status).toBe(403);
    expect((await request(app).get('/admin/permissions')).status).toBe(401);
  });
});

describe('แก้การผูก role ↔ สิทธิ์', () => {
  it('ผูกแล้วผู้ถือ role ใช้ได้ทันที ถอนแล้วใช้ไม่ได้ทันที; บันทึกประวัติ แก้/ลบประวัติไม่ได้', async () => {
    const admin = await actor(['user', 'super_admin']);
    const holder = await actor(['user', 'staff', await testRole('test_comms')]);
    expect((await get(holder, '/staff-announcements')).status).toBe(403);

    const granted = await post(admin, '/admin/roles/test_comms/permissions', { permissionCode: 'staff_announcement:send', reason: 'มอบหมายงานประชาสัมพันธ์' });
    expect(granted.status).toBe(200);
    expect(granted.body).toEqual({ affectedUserCount: 1 });
    expect((await get(holder, '/staff-announcements')).status).toBe(200);

    expect((await post(admin, '/admin/roles/test_comms/permissions', { permissionCode: 'staff_announcement:send', reason: 'ซ้ำ' })).status).toBe(409);
    expect((await post(admin, '/admin/roles/test_comms/permissions/staff_announcement:send/revoke', { reason: 'สิ้นสุดภารกิจ' })).status).toBe(200);
    expect((await get(holder, '/staff-announcements')).status).toBe(403);
    expect((await post(admin, '/admin/roles/test_comms/permissions/staff_announcement:send/revoke', { reason: 'ซ้ำ' })).status).toBe(404);

    expect(await logActions()).toEqual(['role_grant', 'role_revoke']);
    const logs = (await get(admin, '/admin/permission-change-logs')).body;
    expect(logs.items[0]).toMatchObject({ action: 'role_revoke', roleCode: 'test_comms', permissionCode: 'staff_announcement:send', reason: 'สิ้นสุดภารกิจ' });
    await expect(pool.query("UPDATE permission_change_logs SET reason = 'แก้'")).rejects.toThrow();
    await expect(pool.query('DELETE FROM permission_change_logs')).rejects.toThrow();
  });

  it('แก้ role super_admin ไม่ได้; ไม่มีเหตุผล 400; สิทธิ์ที่ไม่มีในโค้ด 404; super_admin แก้ role staff ที่ตนถือได้', async () => {
    const admin = await actor(['user', 'staff', 'super_admin']);
    expect((await post(admin, '/admin/roles/super_admin/permissions', { permissionCode: 'sport:manage', reason: 'x' })).body.error.code).toBe(
      'SUPER_ADMIN_ROLE_FIXED',
    );
    expect((await post(admin, '/admin/roles/staff/permissions', { permissionCode: 'sport:manage', reason: '' })).status).toBe(400);
    expect((await post(admin, '/admin/roles/staff/permissions', { permissionCode: 'nope:nope', reason: 'x' })).status).toBe(404);
    expect((await post(admin, '/admin/roles/no_such_role/permissions', { permissionCode: 'sport:manage', reason: 'x' })).status).toBe(404);

    const res = await post(admin, '/admin/roles/staff/permissions', { permissionCode: 'sport:manage', reason: 'ทดลอง' });
    try {
      expect(res.status).toBe(200);
      expect(res.body.affectedUserCount).toBe(1);
    } finally {
      await post(admin, '/admin/roles/staff/permissions/sport:manage/revoke', { reason: 'คืนค่า' });
    }
  });

  it('ผู้ถือ role_permission:manage ที่ไม่ใช่ super_admin เพิ่มสิทธิ์ที่ตนยังไม่มีให้ role ที่ตนถือไม่ได้ (กันยกระดับสิทธิ์ตนเอง)', async () => {
    const manager = await actor(['user', await testRole('test_manager', ['role_permission:manage'])]);
    const other = await testRole('test_other');
    expect(
      (await post(manager, '/admin/roles/test_manager/permissions', { permissionCode: 'user_account:inspect', reason: 'ขอเพิ่มเอง' })).body.error.code,
    ).toBe('CANNOT_ESCALATE_OWN_ROLE');
    // role อื่นที่ตนไม่ได้ถือ ผูกได้
    expect((await post(manager, `/admin/roles/${other}/permissions`, { permissionCode: 'user_account:inspect', reason: 'มอบหมาย' })).status).toBe(200);
  });
});

describe('สิทธิ์ตามตำแหน่งในชมรม', () => {
  it('ให้เหรัญญิกส่งรายงานได้ → มีผลทันทีทุกชมรม; ถอนคืน', async () => {
    const admin = await actor(['user', 'super_admin']);
    const club = await createTestClub();
    const treasurer = await createTestUser();
    await addCommittee(club, treasurer.id, 'treasurer');
    const auth = async () => (await resolveSession((await createSessionCookie(treasurer.id)).split('=')[1]!))!;

    expect(await getClubPermissions(await auth(), club)).not.toContain('club_report:submit');
    const res = await post(admin, '/admin/club-positions/treasurer/permissions', { clubPermissionCode: 'club_report:submit', reason: 'เหรัญญิกช่วยส่งรายงาน' });
    try {
      expect(res.status).toBe(204);
      expect(await getClubPermissions(await auth(), club)).toContain('club_report:submit');
      expect((await post(admin, '/admin/club-positions/treasurer/permissions', { clubPermissionCode: 'club_report:submit', reason: 'ซ้ำ' })).status).toBe(409);
    } finally {
      await post(admin, '/admin/club-positions/treasurer/permissions/club_report:submit/revoke', { reason: 'คืนค่า' });
    }
    expect(await getClubPermissions(await auth(), club)).not.toContain('club_report:submit');
    expect(await logActions()).toEqual(['position_grant', 'position_revoke']);
    expect((await post(admin, '/admin/club-positions/nope/permissions', { clubPermissionCode: 'club_report:submit', reason: 'x' })).status).toBe(404);
    expect((await post(admin, '/admin/club-positions/treasurer/permissions', { clubPermissionCode: 'nope:nope', reason: 'x' })).status).toBe(404);
  });
});

describe('สร้าง/แก้ role', () => {
  it('สร้าง role ใหม่ → ผูกสิทธิ์ → ให้ผู้ใช้ด้วยการให้ role เดิม (role สิทธิ์สูงให้ได้เฉพาะ super_admin); รหัสซ้ำ/ผิดรูปแบบถูกปฏิเสธ', async () => {
    const admin = await actor(['user', 'super_admin']);
    const created = await post(admin, '/admin/roles', { code: 'test_club_board', nameTh: 'กรรมการสโมสร', description: 'กรรมการบริหารสโมสรบุคลากร', isPrivileged: true, reason: 'ตามคำสั่งแต่งตั้ง' });
    expect(created.status).toBe(201);
    expect((await post(admin, '/admin/roles', { code: 'test_club_board', nameTh: 'x', isPrivileged: false, reason: 'x' })).body.error.code).toBe('ROLE_EXISTS');
    expect((await post(admin, '/admin/roles', { code: 'Bad Code', nameTh: 'x', isPrivileged: false, reason: 'x' })).status).toBe(400);

    await post(admin, '/admin/roles/test_club_board/permissions', { permissionCode: 'staff_announcement:send', reason: 'ส่งประกาศได้' });
    const member = await actor(['user', 'staff']);
    expect((await post(admin, `/admin/users/${member.id}/roles`, { roleCode: 'test_club_board', reason: 'แต่งตั้ง' })).status).toBe(204);
    expect((await get(member, '/staff-announcements')).status).toBe(200);

    const assigner = await actor(['user', await testRole('test_assigner', ['user_role:assign'])]);
    const someone = await actor(['user', 'staff']);
    expect((await post(assigner, `/admin/users/${someone.id}/roles`, { roleCode: 'test_club_board', reason: 'x' })).status).toBe(403);
    expect(await logActions()).toEqual(['role_create', 'role_grant']);
  });

  it('แก้ชื่อ/คำอธิบายได้; role ระบบเปลี่ยนระดับสิทธิ์สูงไม่ได้; role super_admin แก้ไม่ได้', async () => {
    const admin = await actor(['user', 'super_admin']);
    await testRole('test_editable');
    expect((await patch(admin, '/admin/roles/test_editable', { nameTh: 'ชื่อใหม่', description: 'อธิบาย', isPrivileged: true, reason: 'ปรับ' })).status).toBe(204);
    const { rows } = await pool.query("SELECT name_th, is_privileged FROM roles WHERE code = 'test_editable'");
    expect(rows[0]).toEqual({ name_th: 'ชื่อใหม่', is_privileged: true });
    expect((await patch(admin, '/admin/roles/staff', { nameTh: 'บุคลากร', isPrivileged: true, reason: 'x' })).body.error.code).toBe('SYSTEM_ROLE_PRIVILEGE_FIXED');
    expect((await patch(admin, '/admin/roles/super_admin', { nameTh: 'x', isPrivileged: true, reason: 'x' })).body.error.code).toBe('SUPER_ADMIN_ROLE_FIXED');
  });
});
