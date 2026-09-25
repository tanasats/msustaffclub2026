import express from 'express';
import cookieParser from 'cookie-parser';
import { request } from './helpers/http.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { loadSession, requireClubPermission } from '../src/middlewares/auth.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { requestLogger } from '../src/middlewares/request-logger.js';
import { resolveSession } from '../src/services/auth-service.js';
import type { AuthContext } from '../src/services/authorization.js';
import { getClubPermissions } from '../src/services/club-authorization.js';
import { ALL_CLUB_PERMISSIONS, CLUB_PERMISSIONS } from '../src/services/club-permissions.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';

beforeEach(resetDatabase);

// สร้างผู้ใช้ + session แล้วคืน AuthContext จริง (ผ่าน resolveSession เหมือนตอนใช้งาน)
async function authFor(roleCodes: string[] = ['user', 'staff']): Promise<AuthContext & { cookie: string }> {
  const user = await createTestUser();
  for (const code of roleCodes) await grantRole(user.id, code);
  const cookie = await createSessionCookie(user.id);
  const auth = await resolveSession(cookie.split('=')[1]!);
  return { ...auth!, cookie };
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query("INSERT INTO roles (code, name_th) VALUES ($1, $1)", [code]);
  await pool.query(
    'INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2',
    [code, permission],
  );
  return code;
}

describe('ข้อมูลตั้งต้นของชมรม', () => {
  it('มีประเภทชมรม 5 ประเภท (ด้านอื่น ๆ ต้องระบุรายละเอียด)', async () => {
    const { rows } = await pool.query('SELECT code, requires_detail FROM club_categories ORDER BY sort_order');
    expect(rows).toEqual([
      { code: 'academic', requires_detail: false },
      { code: 'ethics_culture', requires_detail: false },
      { code: 'volunteer', requires_detail: false },
      { code: 'health_sports', requires_detail: false },
      { code: 'other', requires_detail: true },
    ]);
  });

  it('สิทธิ์ชมรมทุกตัวในโค้ดตรงกับตาราง club_permissions', async () => {
    const { rows } = await pool.query<{ code: string }>('SELECT code FROM club_permissions ORDER BY code');
    expect(rows.map((r) => r.code)).toEqual([...ALL_CLUB_PERMISSIONS].sort());
  });

  it('ตำแหน่ง ↔ สิทธิ์ ตรงกับที่ยืนยันใน docs/design/club-establishment.md หัวข้อ 3.3', async () => {
    const { rows } = await pool.query<{ position: string; permissions: string[] }>(
      `SELECT p.code AS position,
              ARRAY(SELECT cp.code FROM club_position_permissions cpp
                      JOIN club_permissions cp ON cp.id = cpp.club_permission_id
                     WHERE cpp.position_id = p.id ORDER BY cp.code) AS permissions
         FROM club_positions p ORDER BY p.sort_order`,
    );
    const matrix = Object.fromEntries(rows.map((r) => [r.position, r.permissions]));
    const view = 'club:view_internal';
    const activity = 'club_activity:manage';
    const achievement = 'club_achievement:manage';
    expect(matrix).toEqual({
      president: [view, achievement, activity, 'club_committee:manage', 'club_finance:manage', 'club_member:approve', 'club_profile:edit', 'club_report:submit'],
      vice_president: [view, achievement, activity, 'club_member:approve', 'club_profile:edit'],
      secretary: [view, achievement, activity, 'club_member:approve', 'club_profile:edit', 'club_report:submit'],
      assistant_secretary: [view, achievement, activity],
      treasurer: [view, achievement, activity, 'club_finance:manage'],
      assistant_treasurer: [view, achievement, activity],
      public_relations: [view, achievement, activity, 'club_profile:edit'],
      committee_member: [view, achievement, activity],
      advisor: [view, 'club_report:acknowledge'],
      member: [],
    });
  });

  it('role เจ้าหน้าที่สโมสร/นายกสโมสร มีสิทธิ์ตรวจ/อนุมัติ และให้ได้เฉพาะ super_admin', async () => {
    const { rows } = await pool.query(
      `SELECT r.code, r.name_th, r.is_system, r.is_privileged,
              ARRAY(SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                     WHERE rp.role_id = r.id ORDER BY p.code) AS permissions
         FROM roles r WHERE r.code IN ('club_officer', 'club_president') ORDER BY r.code`,
    );
    expect(rows).toEqual([
      { code: 'club_officer', name_th: 'เจ้าหน้าที่สโมสร', is_system: false, is_privileged: true, permissions: ['club_application:review', 'club_report:review'] },
      { code: 'club_president', name_th: 'นายกสโมสร', is_system: false, is_privileged: true, permissions: ['club_application:approve'] },
    ]);
  });

  it('role staff มี club_application:create (บุคลากรยื่นคำขอได้)', async () => {
    const auth = await authFor(['user', 'staff']);
    expect(auth.permissions).toContain('club_application:create');
    const student = await authFor(['user', 'student']);
    expect(student.permissions).not.toContain('club_application:create');
  });
});

describe('getClubPermissions', () => {
  it('ประธานได้ทุกสิทธิ์ยกเว้นรับทราบรายงาน', async () => {
    const clubId = await createTestClub();
    const auth = await authFor();
    await addCommittee(clubId, auth.user.id, 'president');

    const permissions = await getClubPermissions(auth, clubId);

    expect(permissions).toEqual(ALL_CLUB_PERMISSIONS.filter((p) => p !== CLUB_PERMISSIONS.REPORT_ACKNOWLEDGE));
  });

  it('ที่ปรึกษาได้ดูข้อมูลภายในและรับทราบรายงาน', async () => {
    const clubId = await createTestClub();
    const auth = await authFor();
    await addAdvisor(clubId, auth.user.id);
    expect(await getClubPermissions(auth, clubId)).toEqual([
      CLUB_PERMISSIONS.VIEW_INTERNAL,
      CLUB_PERMISSIONS.REPORT_ACKNOWLEDGE,
    ]);
  });

  it('สมาชิกทั่วไปไม่มีสิทธิ์ชมรม', async () => {
    const clubId = await createTestClub();
    const auth = await authFor();
    await addMembership(clubId, auth.user.id, 'active');
    expect(await getClubPermissions(auth, clubId)).toEqual([]);
  });

  it('หลายตำแหน่งได้สิทธิ์รวมกัน (สมาชิก + เหรัญญิก + ที่ปรึกษา)', async () => {
    const clubId = await createTestClub();
    const auth = await authFor();
    await addMembership(clubId, auth.user.id);
    await addCommittee(clubId, auth.user.id, 'treasurer');
    await addAdvisor(clubId, auth.user.id);
    expect(await getClubPermissions(auth, clubId)).toEqual([
      CLUB_PERMISSIONS.VIEW_INTERNAL,
      CLUB_PERMISSIONS.ACTIVITY_MANAGE,
      CLUB_PERMISSIONS.ACHIEVEMENT_MANAGE,
      CLUB_PERMISSIONS.FINANCE_MANAGE,
      CLUB_PERMISSIONS.REPORT_ACKNOWLEDGE,
    ]);
  });

  it('กรรมการที่สิ้นสุดตำแหน่งแล้ว และผู้สมัครที่ยังรออนุมัติ ไม่ได้สิทธิ์', async () => {
    const clubId = await createTestClub();
    const auth = await authFor();
    await addCommittee(clubId, auth.user.id, 'president', { ended: true });
    await addMembership(clubId, auth.user.id, 'pending');
    expect(await getClubPermissions(auth, clubId)).toEqual([]);
  });

  it('สิทธิ์ผูกกับชมรมนั้นเท่านั้น (ประธานชมรม A ไม่มีสิทธิ์ในชมรม B)', async () => {
    const clubA = await createTestClub();
    const clubB = await createTestClub();
    const auth = await authFor();
    await addCommittee(clubA, auth.user.id, 'president');
    expect(await getClubPermissions(auth, clubB)).toEqual([]);
  });

  it('ไม่พบชมรม → null', async () => {
    const auth = await authFor();
    expect(await getClubPermissions(auth, '01900000-0000-7000-8000-000000000000')).toBeNull();
  });

  it('ชมรมที่ถูกระงับ: ประธานเหลือแค่สิทธิ์อ่าน', async () => {
    const clubId = await createTestClub({ status: 'suspended' });
    const auth = await authFor();
    await addCommittee(clubId, auth.user.id, 'president');
    expect(await getClubPermissions(auth, clubId)).toEqual([CLUB_PERMISSIONS.VIEW_INTERNAL]);
  });

  it('club:manage_all ได้ทุกสิทธิ์ชมรม แม้ชมรมถูกระงับและไม่มีตำแหน่ง', async () => {
    const clubId = await createTestClub({ status: 'suspended' });
    const auth = await authFor(['user', 'staff', await roleWith('club:manage_all')]);
    expect(await getClubPermissions(auth, clubId)).toEqual([...ALL_CLUB_PERMISSIONS]);
  });

  it('super_admin ได้ทุกสิทธิ์ชมรม (ผ่าน hasPermission)', async () => {
    const clubId = await createTestClub();
    const auth = await authFor(['user', 'super_admin']);
    expect(await getClubPermissions(auth, clubId)).toEqual([...ALL_CLUB_PERMISSIONS]);
  });

  it('club:read_all ได้แค่ดูข้อมูลภายใน', async () => {
    const clubId = await createTestClub();
    const auth = await authFor(['user', 'staff', await roleWith('club:read_all')]);
    expect(await getClubPermissions(auth, clubId)).toEqual([CLUB_PERMISSIONS.VIEW_INTERNAL]);
  });

  it('ถอนตำแหน่งแล้วมีผลทันที', async () => {
    const clubId = await createTestClub();
    const auth = await authFor();
    await addCommittee(clubId, auth.user.id, 'secretary');
    expect(await getClubPermissions(auth, clubId)).toContain(CLUB_PERMISSIONS.MEMBER_APPROVE);

    await pool.query(
      "UPDATE club_committee_members SET ended_on = DATE '2026-09-01', end_reason = 'resigned_position' WHERE club_id = $1",
      [clubId],
    );

    expect(await getClubPermissions(auth, clubId)).toEqual([]);
  });
});

describe('requireClubPermission', () => {
  function createClubApp() {
    const app = express();
    app.use(requestLogger);
    app.use(cookieParser());
    app.use(loadSession);
    app.post('/clubs/:clubId/members/approve', requireClubPermission(CLUB_PERMISSIONS.MEMBER_APPROVE), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return app;
  }

  it('ไม่ login → 401', async () => {
    const clubId = await createTestClub();
    expect((await request(createClubApp()).post(`/clubs/${clubId}/members/approve`)).status).toBe(401);
  });

  it('clubId ไม่ใช่ uuid หรือไม่มีชมรมนี้ → 404', async () => {
    const auth = await authFor();
    const app = createClubApp();
    expect((await request(app).post('/clubs/not-a-uuid/members/approve').set('Cookie', auth.cookie)).status).toBe(404);
    const res = await request(app)
      .post('/clubs/01900000-0000-7000-8000-000000000000/members/approve')
      .set('Cookie', auth.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLUB_NOT_FOUND');
  });

  it('ไม่มีสิทธิ์ในชมรมนี้ → 403, มีสิทธิ์ → 200', async () => {
    const clubId = await createTestClub();
    const treasurer = await authFor();
    const secretary = await authFor();
    await addCommittee(clubId, treasurer.user.id, 'treasurer');
    await addCommittee(clubId, secretary.user.id, 'secretary');
    const app = createClubApp();

    expect((await request(app).post(`/clubs/${clubId}/members/approve`).set('Cookie', treasurer.cookie)).status).toBe(403);
    expect((await request(app).post(`/clubs/${clubId}/members/approve`).set('Cookie', secretary.cookie)).status).toBe(200);
  });
});

describe('constraint ของตารางชมรม', () => {
  it('ชื่อชมรมห้ามซ้ำ (ไม่สนตัวพิมพ์และช่องว่างซ้อน) แต่ใช้ชื่อชมรมที่ถูกยุบแล้วได้', async () => {
    await createTestClub({ name: 'ชมรม Music' });
    await expect(createTestClub({ name: '  ชมรม   music ' })).rejects.toThrow(/clubs_name_th_active_key/);

    await pool.query("UPDATE clubs SET status = 'dissolved'");
    await expect(createTestClub({ name: 'ชมรม Music' })).resolves.toBeTruthy();
  });

  it('สมัครซ้ำขณะที่ยังรออนุมัติหรือเป็นสมาชิกอยู่ไม่ได้ แต่สมัครใหม่หลังถูกปฏิเสธได้', async () => {
    const clubId = await createTestClub();
    const user = await createTestUser();
    await addMembership(clubId, user.id, 'pending');
    await expect(addMembership(clubId, user.id, 'pending')).rejects.toThrow(/club_memberships_current_key/);

    await pool.query("UPDATE club_memberships SET status = 'rejected'");
    await expect(addMembership(clubId, user.id, 'pending')).resolves.toBeUndefined();
  });

  it('พ้นสภาพสมาชิกต้องมีทั้งวันที่และเหตุผล', async () => {
    const clubId = await createTestClub();
    const user = await createTestUser();
    await addMembership(clubId, user.id, 'active');
    await expect(pool.query("UPDATE club_memberships SET status = 'ended'")).rejects.toThrow(
      /club_memberships_end_consistency/,
    );
    await pool.query("UPDATE club_memberships SET status = 'ended', ended_on = DATE '2026-09-01', end_reason = 'resigned'");
  });

  it('กรรมการสิ้นสุดตำแหน่งต้องระบุเหตุผลตามระเบียบ', async () => {
    const clubId = await createTestClub();
    const user = await createTestUser();
    await addCommittee(clubId, user.id, 'president');
    await expect(
      pool.query("UPDATE club_committee_members SET ended_on = DATE '2026-09-01', end_reason = 'bored'"),
    ).rejects.toThrow(/club_committee_members_end_reason_check/);
  });
});
