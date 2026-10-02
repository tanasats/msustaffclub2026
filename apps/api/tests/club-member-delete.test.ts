import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
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

async function setup() {
  const clubId = await createTestClub();
  const president = await actor();
  await addMembership(clubId, president.id, 'active');
  await addCommittee(clubId, president.id, 'president');
  const admin = await actor(['user', 'super_admin']);
  return { clubId, president, admin };
}

async function memberRow(clubId: string, userId: string) {
  const { rows } = await pool.query<{ id: string; status: string; status_before_delete: string | null; deleted_by: string | null }>(
    `SELECT id, status, status_before_delete, deleted_by FROM club_memberships WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [clubId, userId],
  );
  return rows[0]!;
}

describe('กรรมการลบรายชื่อที่บันทึกผิด (soft delete)', () => {
  it('สมาชิก active ที่ยังไม่มีข้อมูลผูก → ลบได้ (ต้องมีเหตุผล) หายจากรายชื่อ/จำนวน/สถานะของเจ้าตัว แต่ข้อมูลยังอยู่', async () => {
    const { clubId, president } = await setup();
    const wrong = await actor();
    await addMembership(clubId, wrong.id, 'active');
    const { id } = await memberRow(clubId, wrong.id);
    const path = `/clubs/${clubId}/memberships/${id}/delete`;

    expect((await post(president, path, {})).status).toBe(400);
    expect((await post(president, path, { note: 'อนุมัติผิดคน' })).status).toBe(204);
    expect(await memberRow(clubId, wrong.id)).toMatchObject({ status: 'deleted', status_before_delete: 'active', deleted_by: president.id });

    const list = (await get(president, `/clubs/${clubId}/members`)).body;
    expect(list.items.map((m: { userId: string }) => m.userId)).toEqual([president.id]);
    expect((await get(president, `/clubs/${clubId}`)).body.memberCount).toBe(1);
    expect((await get(wrong, `/clubs/${clubId}`)).body.me.membershipStatus).toBeNull();
    expect((await get(president, `/clubs/${clubId}/members/${wrong.id}`)).status).toBe(404);
    // ผู้ถูกลบสมัครใหม่ได้ (แถวที่ลบไม่ชน unique index)
    expect((await post(wrong, `/clubs/${clubId}/membership`)).status).toBe(204);
    // ข้อมูลของฉัน (PDPA) ยังเห็นรายการที่ถูกลบ
    const mine = (await get(wrong, '/me/data')).body.memberships.map((m: { status: string }) => m.status).sort();
    expect(mine).toEqual(['deleted', 'pending']);
  });

  it('ใบสมัครที่รอ/ไม่อนุมัติลบได้; สมาชิกที่มีข้อมูลผูก/พ้นสภาพแล้ว/ตัวเอง ลบไม่ได้', async () => {
    const { clubId, president } = await setup();
    const del = (id: string) => post(president, `/clubs/${clubId}/memberships/${id}/delete`, { note: 'บันทึกผิด' });

    const applicant = await actor();
    await addMembership(clubId, applicant.id, 'pending');
    expect((await del((await memberRow(clubId, applicant.id)).id)).status).toBe(204);

    const withRecord = await actor();
    await addMembership(clubId, withRecord.id, 'active');
    await pool.query(
      `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, status)
       VALUES ($1, $2, 'ผลงาน', DATE '2026-08-01', 'club', 'other', 'pending')`,
      [clubId, withRecord.id],
    );
    expect((await del((await memberRow(clubId, withRecord.id)).id)).body.error.code).toBe('MEMBER_HAS_RECORDS');

    const former = await actor();
    await addMembership(clubId, former.id, 'active');
    await pool.query(`UPDATE club_memberships SET status = 'ended', ended_on = CURRENT_DATE, end_reason = 'resigned' WHERE user_id = $1`, [former.id]);
    expect((await del((await memberRow(clubId, former.id)).id)).body.error.code).toBe('MEMBERSHIP_NOT_DELETABLE');

    expect((await del((await memberRow(clubId, president.id)).id)).status).toBe(403); // ตัวเอง
  });

  it('ไม่มีสิทธิ์ club_member:approve (เหรัญญิก/สมาชิก) → 403', async () => {
    const { clubId } = await setup();
    const treasurer = await actor();
    await addMembership(clubId, treasurer.id, 'active');
    await addCommittee(clubId, treasurer.id, 'treasurer');
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    const { id } = await memberRow(clubId, member.id);
    expect((await post(treasurer, `/clubs/${clubId}/memberships/${id}/delete`, { note: 'x' })).status).toBe(403);
  });
});

describe('ผู้ดูแลระบบดู/กู้คืนรายชื่อที่ลบ (club_membership:manage_deleted)', () => {
  it('super_admin เห็นแท็บลบแล้วและข้อมูลรายบุคคล แล้วกู้คืนเป็นสถานะเดิม (ต้องมีเหตุผล)', async () => {
    const { clubId, president, admin } = await setup();
    const wrong = await actor();
    await addMembership(clubId, wrong.id, 'active');
    const { id } = await memberRow(clubId, wrong.id);
    await post(president, `/clubs/${clubId}/memberships/${id}/delete`, { note: 'อนุมัติผิดคน' });

    // กรรมการ (ไม่มี permission ระบบ) ไม่เห็นแท็บลบแล้ว
    expect((await get(president, `/clubs/${clubId}/members?status=deleted`)).status).toBe(403);
    const tab = (await get(admin, `/clubs/${clubId}/members?status=deleted`)).body;
    expect(tab.items).toMatchObject([{ userId: wrong.id, status: 'deleted', statusBeforeDelete: 'active' }]);
    const profile = (await get(admin, `/clubs/${clubId}/members/${wrong.id}`)).body;
    expect(profile.person.status).toBe('deleted');
    expect(profile.history[0]).toMatchObject({ action: 'deleted', note: 'อนุมัติผิดคน' });

    const restore = `/clubs/${clubId}/memberships/${id}/restore`;
    expect((await post(admin, restore, {})).status).toBe(400);
    expect((await post(president, restore, { note: 'x' })).status).toBe(403);
    expect((await post(admin, restore, { note: 'กรรมการลบผิด' })).status).toBe(204);
    expect(await memberRow(clubId, wrong.id)).toMatchObject({ status: 'active', status_before_delete: null, deleted_by: null });
    expect((await post(admin, restore, { note: 'ซ้ำ' })).body.error.code).toBe('MEMBERSHIP_NOT_DELETED');
  });

  it('กู้คืนไม่ได้ถ้าผู้ใช้มีใบสมัคร/สมาชิกภาพใหม่แล้ว หรือบัญชีถูกปิด', async () => {
    const { clubId, president, admin } = await setup();
    const person = await actor();
    await addMembership(clubId, person.id, 'pending');
    const { id } = await memberRow(clubId, person.id);
    await post(president, `/clubs/${clubId}/memberships/${id}/delete`, { note: 'ซ้ำ' });
    await post(person, `/clubs/${clubId}/membership`);
    expect((await post(admin, `/clubs/${clubId}/memberships/${id}/restore`, { note: 'x' })).body.error.code).toBe('MEMBERSHIP_CONFLICT');

    const gone = await actor();
    await addMembership(clubId, gone.id, 'pending');
    const row = await memberRow(clubId, gone.id);
    await post(president, `/clubs/${clubId}/memberships/${row.id}/delete`, { note: 'x' });
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [gone.id]);
    expect((await post(admin, `/clubs/${clubId}/memberships/${row.id}/restore`, { note: 'x' })).body.error.code).toBe('USER_INACTIVE');
  });

  it('ผู้ถือ role ที่ผูก club_membership:manage_deleted กู้คืนได้ (ไม่ได้เช็คชื่อ role)', async () => {
    const { clubId, president } = await setup();
    const manager = await actor(['user', 'staff', await roleWith('club_membership:manage_deleted')]);
    const person = await actor();
    await addMembership(clubId, person.id, 'pending');
    const { id } = await memberRow(clubId, person.id);
    await post(president, `/clubs/${clubId}/memberships/${id}/delete`, { note: 'x' });
    expect((await post(manager, `/clubs/${clubId}/memberships/${id}/restore`, { note: 'x' })).status).toBe(204);
  });

  it('CHECK: ลบผู้ที่พ้นสภาพแล้วตรง ๆ ในฐานข้อมูลไม่ได้', async () => {
    const { clubId, president } = await setup();
    await pool.query(`UPDATE club_memberships SET status = 'ended', ended_on = CURRENT_DATE, end_reason = 'resigned' WHERE user_id = $1`, [president.id]);
    await expect(
      pool.query(
        `UPDATE club_memberships SET status_before_delete = status, status = 'deleted', deleted_at = now(), deleted_by = $2 WHERE club_id = $1`,
        [clubId, president.id],
      ),
    ).rejects.toThrow(/club_memberships_(end_consistency|status_before_delete_check)/);
  });
});
