import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { ALL_NOTIFICATION_EVENTS } from '../src/services/notification-events.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff'], options: { isActive?: boolean } = {}): Promise<Actor> {
  const user = await createTestUser({ isActive: options.isActive });
  for (const role of roles) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const post = (who: Actor, path: string, body: object) => request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);

async function enableEmail() {
  const events = Object.fromEntries(ALL_NOTIFICATION_EVENTS.map((code) => [code, true]));
  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ('email.enabled', 'true'::jsonb), ('email.events', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(events)],
  );
}

async function notifiedUsers(kind: string): Promise<string[]> {
  const { rows } = await pool.query<{ userId: string }>('SELECT user_id AS "userId" FROM notifications WHERE kind = $1 ORDER BY user_id', [kind]);
  return rows.map((r) => r.userId);
}

async function emailedUsers(kind: string): Promise<string[]> {
  const { rows } = await pool.query<{ userId: string }>(
    'SELECT recipient_user_id AS "userId" FROM email_outbox WHERE kind = $1 ORDER BY recipient_user_id',
    [kind],
  );
  return rows.map((r) => r.userId);
}

async function orgUnitId(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM org_units WHERE code = $1', [code]);
  return rows[0]!.id;
}

const MESSAGE = { title: 'ประชุมสามัญประจำปี', body: 'ขอเชิญบุคลากรร่วมประชุม\nวันศุกร์ เวลา 13.30 น.' };

describe('ประกาศจากสโมสรบุคลากร (staff_announcement:send)', () => {
  it('เจ้าหน้าที่สโมสร/นายกสโมสร/super_admin ส่งได้; บุคลากรทั่วไปและผู้ไม่ login ไม่ได้', async () => {
    const officer = await actor(['user', 'staff', 'club_officer']);
    const president = await actor(['user', 'staff', 'club_president']);
    const admin = await actor(['user', 'super_admin']);
    const staff = await actor();

    for (const who of [officer, president, admin]) {
      expect((await post(who, '/staff-announcements/recipient-count', { audience: 'all_staff' })).status).toBe(200);
    }
    expect((await post(staff, '/staff-announcements', { audience: 'all_staff', ...MESSAGE })).status).toBe(403);
    expect((await get(staff, '/staff-announcements')).status).toBe(403);
    expect((await get(staff, '/staff-announcements/org-units')).status).toBe(403);
    expect((await get(officer, '/staff-announcements/org-units')).body.items.length).toBeGreaterThan(0);
    expect((await request(app).get('/staff-announcements')).status).toBe(401);
  });

  it('บุคลากรทุกคน: เฉพาะบัญชีบุคลากรที่ใช้งานอยู่ ไม่รวมผู้ส่ง/นิสิต/บัญชีที่ปิด; ได้กระดิ่งทุกคน อีเมลเฉพาะผู้ที่ไม่ปิดรับ; บันทึกประวัติ', async () => {
    await enableEmail();
    const officer = await actor(['user', 'staff', 'club_officer']);
    const a = await actor();
    const b = await actor();
    await actor(['user', 'student']);
    await actor(['user', 'staff'], { isActive: false });
    await pool.query('INSERT INTO user_preferences (user_id, email_notifications) VALUES ($1, false)', [b.id]);

    expect((await post(officer, '/staff-announcements/recipient-count', { audience: 'all_staff' })).body).toEqual({ count: 2 });
    const res = await post(officer, '/staff-announcements', { audience: 'all_staff', ...MESSAGE });
    expect(res.status).toBe(201);
    expect(res.body.recipientCount).toBe(2);

    expect(await notifiedUsers('staff_announcement')).toEqual([a.id, b.id].sort());
    expect(await emailedUsers('staff_announcement')).toEqual([a.id]);
    const note = (await get(a, '/me/notifications')).body.items[0];
    expect(note).toMatchObject({ title: '[ประกาศสโมสรบุคลากร] ประชุมสามัญประจำปี', linkPath: '/notifications' });
    expect(note.body).toContain('วันศุกร์ เวลา 13.30 น.');

    const history = (await get(officer, '/staff-announcements')).body;
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({ audience: 'all_staff', title: MESSAGE.title, recipientCount: 2 });
  });

  it('กรรมการชมรม / สมาชิกชมรม (เฉพาะชมรมที่ดำเนินการอยู่) / ตามหน่วยงาน', async () => {
    const officer = await actor(['user', 'staff', 'club_officer']);
    const club = await createTestClub();
    const suspended = await createTestClub({ name: 'ชมรมที่ถูกระงับ', status: 'suspended' });
    const chair = await actor();
    const member = await actor();
    const pending = await actor();
    const otherChair = await actor();
    await addCommittee(club, chair.id, 'president');
    await addMembership(club, chair.id);
    await addMembership(club, member.id);
    await addMembership(club, pending.id, 'pending');
    await addCommittee(suspended, otherChair.id, 'president');

    const count = async (body: object) => (await post(officer, '/staff-announcements/recipient-count', body)).body.count;
    expect(await count({ audience: 'club_committees' })).toBe(1);
    expect(await count({ audience: 'club_members' })).toBe(2);

    const planning = await orgUnitId('82');
    await pool.query(
      `INSERT INTO staff_profiles (user_id, staff_code, first_name_th, last_name_th, org_unit_id, synced_at) VALUES ($1, '1', 'ก', 'ข', $2, now())`,
      [member.id, planning],
    );
    expect(await count({ audience: 'org_units', orgUnitIds: [planning] })).toBe(1);
    expect((await post(officer, '/staff-announcements/recipient-count', { audience: 'org_units', orgUnitIds: [] })).body.error.code).toBe('ORG_UNITS_REQUIRED');
    expect(
      (await post(officer, '/staff-announcements/recipient-count', { audience: 'org_units', orgUnitIds: ['01900000-0000-7000-8000-000000000000'] })).body.error.code,
    ).toBe('ORG_UNIT_NOT_FOUND');

    const sent = await post(officer, '/staff-announcements', { audience: 'org_units', orgUnitIds: [planning], ...MESSAGE });
    expect(sent.body.recipientCount).toBe(1);
    expect((await get(officer, '/staff-announcements')).body.items[0].orgUnitNames).toEqual(['กองแผนงาน']);
  });

  it('ไม่มีผู้รับ → 422 ไม่บันทึก; หัวข้อว่าง/ข้อความยาวเกิน/กลุ่มผู้รับไม่รู้จัก → 400', async () => {
    const officer = await actor(['user', 'staff', 'club_officer']);
    const res = await post(officer, '/staff-announcements', { audience: 'club_members', ...MESSAGE });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_RECIPIENTS');
    expect((await get(officer, '/staff-announcements')).body.total).toBe(0);

    expect((await post(officer, '/staff-announcements', { audience: 'all_staff', title: '', body: 'x' })).status).toBe(400);
    expect((await post(officer, '/staff-announcements', { audience: 'all_staff', title: 'x', body: 'ก'.repeat(3001) })).status).toBe(400);
    expect((await post(officer, '/staff-announcements', { audience: 'everyone', ...MESSAGE })).status).toBe(400);
  });
});

describe('ข้อความจากกรรมการชมรมถึงสมาชิก (club_message:send)', () => {
  it('กรรมการทุกตำแหน่งส่งได้ ถึงสมาชิก active เท่านั้น (ไม่รวมผู้ส่ง/ใบสมัครที่รอ/บัญชีที่ปิด); ลิงก์ไปหน้าชมรม', async () => {
    const club = await createTestClub({ name: 'ชมรมดนตรีไทย' });
    const treasurer = await actor();
    const member = await actor();
    const pending = await actor();
    const inactive = await actor(['user', 'staff'], { isActive: false });
    await addCommittee(club, treasurer.id, 'treasurer');
    for (const u of [treasurer, member, inactive]) await addMembership(club, u.id);
    await addMembership(club, pending.id, 'pending');

    expect((await get(treasurer, `/clubs/${club}/messages/recipient-count`)).body).toEqual({ count: 1 });
    const res = await post(treasurer, `/clubs/${club}/messages`, MESSAGE);
    expect(res.status).toBe(201);
    expect(res.body.recipientCount).toBe(1);
    expect(await notifiedUsers('club_message')).toEqual([member.id]);
    expect((await get(member, '/me/notifications')).body.items[0]).toMatchObject({
      title: '[ชมรมดนตรีไทย] ประชุมสามัญประจำปี',
      linkPath: `/clubs/${club}`,
    });
    expect((await get(treasurer, `/clubs/${club}/messages`)).body.items[0]).toMatchObject({ audience: 'club', recipientCount: 1 });
  });

  it('สมาชิกทั่วไป/กรรมการชมรมอื่น 403; ชมรมที่ถูกระงับ 403; ชมรมไม่มี 404; เจ้าหน้าที่สโมสร (ไม่ใช่กรรมการชมรม) 403', async () => {
    const club = await createTestClub();
    const other = await createTestClub({ name: 'ชมรมอื่น' });
    const suspended = await createTestClub({ name: 'ชมรมระงับ', status: 'suspended' });
    const member = await actor();
    const otherChair = await actor();
    const suspendedChair = await actor();
    const officer = await actor(['user', 'staff', 'club_officer']);
    await addMembership(club, member.id);
    await addCommittee(other, otherChair.id, 'president');
    await addCommittee(suspended, suspendedChair.id, 'president');

    expect((await post(member, `/clubs/${club}/messages`, MESSAGE)).status).toBe(403);
    expect((await post(otherChair, `/clubs/${club}/messages`, MESSAGE)).status).toBe(403);
    expect((await post(suspendedChair, `/clubs/${suspended}/messages`, MESSAGE)).status).toBe(403);
    expect((await post(officer, `/clubs/${club}/messages`, MESSAGE)).status).toBe(403);
    expect((await post(otherChair, '/clubs/01900000-0000-7000-8000-000000000000/messages', MESSAGE)).status).toBe(404);
  });

  it('ไม่มีสมาชิกคนอื่น → 422; ประวัติแก้ไข/ลบไม่ได้', async () => {
    const club = await createTestClub();
    const chair = await actor();
    await addCommittee(club, chair.id, 'president');
    await addMembership(club, chair.id);
    expect((await post(chair, `/clubs/${club}/messages`, MESSAGE)).body.error.code).toBe('NO_RECIPIENTS');

    const member = await actor();
    await addMembership(club, member.id);
    await post(chair, `/clubs/${club}/messages`, MESSAGE);
    await expect(pool.query("UPDATE broadcast_messages SET title = 'แก้'")).rejects.toThrow();
    await expect(pool.query('DELETE FROM broadcast_messages')).rejects.toThrow();
  });
});
