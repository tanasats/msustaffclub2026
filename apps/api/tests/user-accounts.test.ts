import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff']): Promise<Actor> {
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

const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const q = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows;

// ผู้ที่จะพ้นจากมหาวิทยาลัย: ประธานชมรม A, สมาชิกชมรม B (เป็นนักกีฬา), สมัครชมรม C, ได้รับเชิญชมรม D, ที่ปรึกษาชมรม E
async function setup() {
  const admin = await actor(['user', 'super_admin']);
  const leaver = await actor();
  const [a, b, c, d, e] = [
    await createTestClub({ name: 'ชมรม A' }),
    await createTestClub({ name: 'ชมรม B' }),
    await createTestClub({ name: 'ชมรม C' }),
    await createTestClub({ name: 'ชมรม D' }),
    await createTestClub({ name: 'ชมรม E' }),
  ];
  await addMembership(a, leaver.id, 'active');
  await addCommittee(a, leaver.id, 'president');
  await addMembership(b, leaver.id, 'active');
  const { rows: sport } = await pool.query(`SELECT id FROM sports WHERE code = 'running'`);
  await pool.query('INSERT INTO club_athletes (club_id, user_id, sport_id) VALUES ($1, $2, $3)', [b, leaver.id, sport[0].id]);
  await addMembership(c, leaver.id, 'pending');
  await pool.query(`INSERT INTO club_memberships (club_id, user_id, status, invited_by) VALUES ($1, $2, 'invited', $3)`, [d, leaver.id, admin.id]);
  await addAdvisor(e, leaver.id);
  return { admin, leaver, clubs: { a, b, c, d, e } };
}

describe('ปิดบัญชีผู้พ้นจากมหาวิทยาลัย (user_account:deactivate)', () => {
  it('ดูผลกระทบก่อน แล้วปิดบัญชี → พ้นสภาพ/พ้นตำแหน่ง/สิ้นสุดที่ปรึกษาทุกชมรม ออกจากระบบทันที และบันทึกประวัติ', async () => {
    const { admin, leaver, clubs } = await setup();
    const overview = (await get(admin, `/user-accounts/${leaver.id}`)).body;
    expect(overview.effects.memberships.map((m: { status: string }) => m.status).sort()).toEqual(['active', 'active', 'invited', 'pending']);
    expect(overview.effects.committee).toMatchObject([{ clubName: 'ชมรม A', isPresident: true }]);
    expect(overview.effects.advisorships).toMatchObject([{ clubName: 'ชมรม E' }]);

    const path = `/user-accounts/${leaver.id}/deactivate`;
    expect((await post(admin, path, {})).status).toBe(400);
    const res = await post(admin, path, { reason: 'เกษียณอายุราชการ 30 ก.ย. 2569' });
    expect(res.status).toBe(200);
    expect(res.body.effects).toEqual({ membershipsEnded: 2, applicationsWithdrawn: 2, committeePositionsEnded: 1, advisorshipsEnded: 1 });
    expect(res.body.clubsWithoutPresident).toEqual([{ clubId: clubs.a, clubName: 'ชมรม A' }]);

    expect((await q('SELECT is_active FROM users WHERE id = $1', [leaver.id]))[0].is_active).toBe(false);
    expect((await get(leaver, '/auth/me')).status).toBe(401);
    expect(await q('SELECT 1 FROM sessions WHERE user_id = $1', [leaver.id])).toEqual([]); // ออกจากระบบทุกอุปกรณ์
    const ms = await q(`SELECT c.name_th, m.status, m.end_reason FROM club_memberships m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = $1 ORDER BY c.name_th`, [leaver.id]);
    expect(ms).toEqual([
      { name_th: 'ชมรม A', status: 'ended', end_reason: 'left_university' },
      { name_th: 'ชมรม B', status: 'ended', end_reason: 'left_university' },
      { name_th: 'ชมรม C', status: 'withdrawn', end_reason: null },
      { name_th: 'ชมรม D', status: 'withdrawn', end_reason: null },
    ]);
    expect(await q('SELECT end_reason FROM club_committee_members WHERE user_id = $1', [leaver.id])).toEqual([{ end_reason: 'left_university' }]);
    expect(await q('SELECT ended_on IS NOT NULL AS ended FROM club_advisors WHERE user_id = $1', [leaver.id])).toEqual([{ ended: true }]);
    expect(await q('SELECT ended_at IS NOT NULL AS ended FROM club_athletes WHERE user_id = $1', [leaver.id])).toEqual([{ ended: true }]);
    const events = await q(
      `SELECT e.action, e.note FROM club_membership_events e JOIN club_memberships m ON m.id = e.membership_id WHERE m.user_id = $1 ORDER BY e.action`,
      [leaver.id],
    );
    expect(events.every((e) => e.note === 'พ้นจากมหาวิทยาลัย: เกษียณอายุราชการ 30 ก.ย. 2569')).toBe(true);
    expect((await get(admin, `/user-accounts/${leaver.id}`)).body.history).toMatchObject([{ action: 'deactivated', reason: 'เกษียณอายุราชการ 30 ก.ย. 2569' }]);
    // ประธานชมรมใหม่: super_admin (club:manage_all) โอนตำแหน่งให้สมาชิกที่เหลือได้
    const heir = await actor();
    await addMembership(clubs.a, heir.id, 'active');
    expect((await post(admin, `/clubs/${clubs.a}/committee/transfer-presidency`, { userId: heir.id })).status).toBe(204);
    // ปิดซ้ำไม่ได้
    expect((await post(admin, path, { reason: 'ซ้ำ' })).body.error.code).toBe('ALREADY_INACTIVE');
  });

  it('เปิดบัญชีคืน: login ได้อีก แต่สมาชิกภาพเดิมไม่คืนอัตโนมัติ', async () => {
    const { admin, leaver } = await setup();
    await post(admin, `/user-accounts/${leaver.id}/deactivate`, { reason: 'ลาออก' });
    expect((await post(admin, `/user-accounts/${leaver.id}/reactivate`, { reason: 'ปิดผิดคน' })).status).toBe(204);
    expect((await q('SELECT is_active FROM users WHERE id = $1', [leaver.id]))[0].is_active).toBe(true);
    expect(await q(`SELECT 1 FROM club_memberships WHERE user_id = $1 AND status = 'active'`, [leaver.id])).toEqual([]);
    expect((await post(admin, `/user-accounts/${leaver.id}/reactivate`, { reason: 'ซ้ำ' })).body.error.code).toBe('ALREADY_ACTIVE');
  });

  it('ห้ามปิดบัญชีตัวเอง และผู้ดูแลระบบสูงสุดคนสุดท้าย (rollback ทั้งหมด)', async () => {
    const admin = await actor(['user', 'super_admin']);
    expect((await post(admin, `/user-accounts/${admin.id}/deactivate`, { reason: 'x' })).body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
    const manager = await actor(['user', 'staff', await roleWith('user_account:deactivate')]);
    const res = await post(manager, `/user-accounts/${admin.id}/deactivate`, { reason: 'x' });
    expect(res.body.error.code).toBe('LAST_SUPER_ADMIN');
    expect((await q('SELECT is_active FROM users WHERE id = $1', [admin.id]))[0].is_active).toBe(true);
    expect(await q('SELECT 1 FROM user_account_events', [])).toEqual([]);
  });

  it('ไม่มี permission (รวมผู้มี user_role:assign) → 403; ผู้ถือ role ที่ผูก permission ทำได้', async () => {
    const { leaver } = await setup();
    const roleAdmin = await actor(['user', 'staff', await roleWith('user_role:assign')]);
    expect((await get(roleAdmin, `/user-accounts/${leaver.id}`)).status).toBe(403);
    expect((await post(roleAdmin, `/user-accounts/${leaver.id}/deactivate`, { reason: 'x' })).status).toBe(403);
    const manager = await actor(['user', 'staff', await roleWith('user_account:deactivate')]);
    expect((await post(manager, `/user-accounts/${leaver.id}/deactivate`, { reason: 'ลาออก' })).status).toBe(200);
  });
});
