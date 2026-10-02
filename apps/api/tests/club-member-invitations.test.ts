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
  email: string;
  cookie: string;
}

async function actor(email?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  for (const role of ['user', 'staff']) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function setup() {
  const clubId = await createTestClub({ name: 'ชมรมดนตรี' });
  const president = await actor();
  await addMembership(clubId, president.id, 'active');
  await addCommittee(clubId, president.id, 'president');
  const treasurer = await actor();
  await addMembership(clubId, treasurer.id, 'active');
  await addCommittee(clubId, treasurer.id, 'treasurer');
  return { clubId, president, treasurer };
}

const statusOf = async (clubId: string, userId: string) =>
  (await pool.query('SELECT status, decided_by FROM club_memberships WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [clubId, userId])).rows[0];

describe('เชิญเข้าชมรม', () => {
  it('กรรมการเชิญ → ผู้ถูกเชิญเห็นคำเชิญ (หน้าชมรม/รายการ/ตัวเลข) → ตอบรับแล้วเป็นสมาชิกทันที', async () => {
    const { clubId, president } = await setup();
    const guest = await actor();
    expect((await post(president, `/clubs/${clubId}/invitations`, { userId: guest.id, note: 'ชวนมาเล่นดนตรี' })).status).toBe(204);
    expect(await statusOf(clubId, guest.id)).toMatchObject({ status: 'invited' });

    expect((await get(guest, `/clubs/${clubId}`)).body.me.invitation).toMatchObject({ note: 'ชวนมาเล่นดนตรี' });
    expect((await get(guest, '/me/club-invitations')).body.items).toMatchObject([{ clubId, clubName: 'ชมรมดนตรี' }]);
    expect((await get(guest, '/auth/me')).body.nominations.clubInvitations).toBe(1);
    expect((await get(president, `/clubs/${clubId}/invitations`)).body.items).toMatchObject([{ userId: guest.id }]);
    // ได้รับคำเชิญแล้ว สมัครซ้ำไม่ได้ (ให้ตอบรับแทน)
    expect((await post(guest, `/clubs/${clubId}/membership`)).body.error.code).toBe('ALREADY_INVITED');

    expect((await post(guest, `/clubs/${clubId}/membership/invitation`, { decision: 'accept' })).status).toBe(204);
    expect(await statusOf(clubId, guest.id)).toEqual({ status: 'active', decided_by: president.id });
    expect((await get(guest, '/auth/me')).body.nominations.clubInvitations).toBe(0);
  });

  it('ปฏิเสธคำเชิญ → declined แล้วสมัครเองภายหลังได้; กรรมการยกเลิกคำเชิญได้', async () => {
    const { clubId, president } = await setup();
    const guest = await actor();
    await post(president, `/clubs/${clubId}/invitations`, { userId: guest.id });
    expect((await post(guest, `/clubs/${clubId}/membership/invitation`, { decision: 'decline' })).status).toBe(204);
    expect(await statusOf(clubId, guest.id)).toMatchObject({ status: 'declined' });
    expect((await post(guest, `/clubs/${clubId}/membership/invitation`, { decision: 'accept' })).status).toBe(404);
    expect((await post(guest, `/clubs/${clubId}/membership`)).status).toBe(204);

    const other = await actor();
    await post(president, `/clubs/${clubId}/invitations`, { userId: other.id });
    const { rows } = await pool.query(`SELECT id FROM club_memberships WHERE user_id = $1`, [other.id]);
    expect((await post(president, `/clubs/${clubId}/memberships/${rows[0].id}/cancel-invitation`)).status).toBe(204);
    expect(await statusOf(clubId, other.id)).toMatchObject({ status: 'withdrawn' });
  });

  it('เชิญไม่ได้: ตัวเอง / สมาชิกอยู่แล้ว / เชิญซ้ำ / นิสิต / ไม่มีสิทธิ์ (เหรัญญิก)', async () => {
    const { clubId, president, treasurer } = await setup();
    const invite = (who: Actor, userId: string) => post(who, `/clubs/${clubId}/invitations`, { userId });
    expect((await invite(president, president.id)).body.error.code).toBe('CANNOT_INVITE_SELF');
    expect((await invite(president, treasurer.id)).body.error.code).toBe('ALREADY_RELATED');
    const guest = await actor();
    await invite(president, guest.id);
    expect((await invite(president, guest.id)).body.error.code).toBe('ALREADY_RELATED');
    const student = await actor('65010999001@msu.ac.th');
    expect((await invite(president, student.id)).body.error.code).toBe('USER_NOT_ELIGIBLE');
    expect((await invite(treasurer, (await actor()).id)).status).toBe(403);
  });
});

describe('สรุปสมาชิก', () => {
  it('นับสมาชิก/กรรมการ/ใบสมัคร/คำเชิญ/คำขอลาออก/เข้า-ออก และแยกตามหน่วยงาน; ต้องมี club:view_internal', async () => {
    const { clubId, president } = await setup();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const guest = await actor();
    await post(president, `/clubs/${clubId}/invitations`, { userId: guest.id });
    const leaver = await actor();
    await addMembership(clubId, leaver.id, 'active');
    await post(leaver, `/clubs/${clubId}/membership/leave`, { note: 'ย้ายงาน' });

    const res = await get(president, `/clubs/${clubId}/members/summary`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ active: 3, committee: 2, pendingApplications: 1, pendingInvitations: 1, pendingResignations: 1 });
    expect(res.body.monthly).toHaveLength(12);
    expect(res.body.byOrgUnit.reduce((sum: number, r: { count: number }) => sum + r.count, 0)).toBe(3);
    expect((await get(applicant, `/clubs/${clubId}/members/summary`)).status).toBe(403);
  });
});

describe('อีเมลแจ้งเตือนเรื่องสมาชิก', () => {
  it('สมัคร → กรรมการที่อนุมัติได้, ผลใบสมัคร → ผู้สมัคร, เชิญ → ผู้ถูกเชิญ, ยื่นลาออก → กรรมการที่อนุมัติได้', async () => {
    await pool.query(`INSERT INTO system_settings (key, value) VALUES ('email.enabled', 'true')`);
    const { clubId, president, treasurer } = await setup();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const { rows } = await pool.query(`SELECT id FROM club_memberships WHERE user_id = $1`, [applicant.id]);
    await post(president, `/clubs/${clubId}/memberships/${rows[0].id}/reject`, { note: 'รับเต็มแล้ว' });
    const guest = await actor();
    await post(president, `/clubs/${clubId}/invitations`, { userId: guest.id });
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    await post(member, `/clubs/${clubId}/membership/leave`, { note: 'ย้ายงาน' });

    const { rows: mails } = await pool.query<{ kind: string; recipient_email: string; body_text: string }>(
      "SELECT kind, recipient_email, body_text FROM email_outbox WHERE kind LIKE 'membership_%' OR kind = 'resignation_requested' ORDER BY created_at",
    );
    const who = (kind: string) => mails.filter((m) => m.kind === kind).map((m) => m.recipient_email);
    // เหรัญญิกไม่มีสิทธิ์อนุมัติสมาชิก จึงไม่ได้รับ
    expect(who('membership_applied')).toEqual([president.email]);
    expect(who('membership_decided')).toEqual([applicant.email]);
    expect(mails.find((m) => m.kind === 'membership_decided')!.body_text).toContain('รับเต็มแล้ว');
    expect(who('membership_invited')).toEqual([guest.email]);
    expect(who('resignation_requested')).toEqual([president.email]);
    expect(who('membership_applied')).not.toContain(treasurer.email);
  });
});
