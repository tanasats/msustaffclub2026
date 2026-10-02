import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';
import { processDueResignations } from '../src/services/membership-service.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(email?: string, roles: string[] = ['user', 'staff']): Promise<Actor> {
  const user = await createTestUser({ email });
  for (const role of roles) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function membershipOf(clubId: string, userId: string) {
  const { rows } = await pool.query<{ id: string; status: string; end_reason: string | null; decided_by: string | null }>(
    `SELECT id, status, end_reason, decided_by FROM club_memberships
      WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [clubId, userId],
  );
  return rows[0] ?? null;
}

async function eventsOf(membershipId: string) {
  const { rows } = await pool.query<{ action: string; note: string | null; actor_user_id: string | null }>(
    'SELECT action, note, actor_user_id FROM club_membership_events WHERE membership_id = $1 ORDER BY created_at, id',
    [membershipId],
  );
  return rows;
}

// ชมรมที่มีประธาน (อนุมัติสมาชิกได้) และเหรัญญิก (อนุมัติไม่ได้)
async function clubWithCommittee() {
  const clubId = await createTestClub();
  const president = await actor();
  const treasurer = await actor();
  for (const [who, position] of [[president, 'president'], [treasurer, 'treasurer']] as const) {
    await addCommittee(clubId, who.id, position);
    await addMembership(clubId, who.id, 'active');
  }
  return { clubId, president, treasurer };
}

describe('สมัครสมาชิก', () => {
  it('บุคลากรสมัครได้ → รออนุมัติ พร้อมประวัติ', async () => {
    const { clubId } = await clubWithCommittee();
    const applicant = await actor();

    expect((await post(applicant, `/clubs/${clubId}/membership`)).status).toBe(204);

    const membership = await membershipOf(clubId, applicant.id);
    expect(membership?.status).toBe('pending');
    expect(await eventsOf(membership!.id)).toEqual([{ action: 'applied', note: null, actor_user_id: applicant.id }]);
    expect((await get(applicant, `/clubs/${clubId}`)).body.me.membershipStatus).toBe('pending');
  });

  it('นิสิตสมัครไม่ได้ (ยังไม่เปิดรับ)', async () => {
    const { clubId } = await clubWithCommittee();
    const student = await actor('65010999001@msu.ac.th', ['user', 'student']);
    const res = await post(student, `/clubs/${clubId}/membership`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ELIGIBLE');
  });

  it('สมัครซ้ำ / เป็นสมาชิกอยู่แล้ว / ชมรมถูกระงับ → ปฏิเสธ', async () => {
    const { clubId, treasurer } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    expect((await post(applicant, `/clubs/${clubId}/membership`)).body.error.code).toBe('ALREADY_APPLIED');
    expect((await post(treasurer, `/clubs/${clubId}/membership`)).body.error.code).toBe('ALREADY_APPLIED');

    const suspended = await createTestClub({ status: 'suspended' });
    expect((await post(applicant, `/clubs/${suspended}/membership`)).body.error.code).toBe('CLUB_NOT_ACTIVE');
  });

  it('ยกเลิกใบสมัครได้ (เก็บเป็น withdrawn) แล้วสมัครใหม่ได้', async () => {
    const { clubId } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const first = await membershipOf(clubId, applicant.id);

    expect((await post(applicant, `/clubs/${clubId}/membership/withdraw`)).status).toBe(204);
    expect((await pool.query('SELECT status FROM club_memberships WHERE id = $1', [first!.id])).rows[0].status).toBe('withdrawn');
    expect((await post(applicant, `/clubs/${clubId}/membership`)).status).toBe(204);
  });
});

describe('กรรมการอนุมัติ/ปฏิเสธ', () => {
  it('ประธานเห็นใบสมัครที่รออนุมัติ และอนุมัติได้ → เป็นสมาชิก (บันทึกผู้อนุมัติ)', async () => {
    const { clubId, president } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);

    const requests = (await get(president, `/clubs/${clubId}/membership-requests`)).body.items;
    expect(requests).toHaveLength(1);
    expect((await post(president, `/clubs/${clubId}/memberships/${requests[0].membershipId}/approve`)).status).toBe(204);

    const membership = await membershipOf(clubId, applicant.id);
    expect(membership).toMatchObject({ status: 'active', decided_by: president.id });
    expect((await eventsOf(membership!.id)).map((e) => e.action)).toEqual(['applied', 'approved']);
  });

  it('ปฏิเสธพร้อมเหตุผลได้', async () => {
    const { clubId, president } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const { id } = (await membershipOf(clubId, applicant.id))!;

    expect((await post(president, `/clubs/${clubId}/memberships/${id}/reject`, { note: 'ข้อมูลไม่ครบ' })).status).toBe(204);
    expect((await membershipOf(clubId, applicant.id))?.status).toBe('rejected');
    expect((await eventsOf(id)).at(-1)).toMatchObject({ action: 'rejected', note: 'ข้อมูลไม่ครบ' });
    // ผู้สมัครเห็นเหตุผลที่หน้าชมรม
    expect((await get(applicant, `/clubs/${clubId}`)).body.me.rejection).toMatchObject({ note: 'ข้อมูลไม่ครบ' });
    // สมัครใหม่แล้ว ไม่แสดงผลปฏิเสธเดิม
    await post(applicant, `/clubs/${clubId}/membership`);
    expect((await get(applicant, `/clubs/${clubId}`)).body.me.rejection).toBeNull();
  });

  it('ปฏิเสธต้องมีเหตุผล', async () => {
    const { clubId, president } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const { id } = (await membershipOf(clubId, applicant.id))!;
    expect((await post(president, `/clubs/${clubId}/memberships/${id}/reject`, {})).status).toBe(400);
    expect((await post(president, `/clubs/${clubId}/memberships/${id}/reject`, { note: '  ' })).status).toBe(400);
    expect((await membershipOf(clubId, applicant.id))?.status).toBe('pending');
  });

  it('ตำแหน่งที่ไม่มีสิทธิ์อนุมัติ (เหรัญญิก) → 403 ทั้งดูรายการและอนุมัติ', async () => {
    const { clubId, treasurer } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const { id } = (await membershipOf(clubId, applicant.id))!;
    expect((await get(treasurer, `/clubs/${clubId}/membership-requests`)).status).toBe(403);
    expect((await post(treasurer, `/clubs/${clubId}/memberships/${id}/approve`)).status).toBe(403);
  });

  it('ประธานชมรม A อนุมัติใบสมัครของชมรม B ไม่ได้', async () => {
    const a = await clubWithCommittee();
    const b = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${b.clubId}/membership`);
    const { id } = (await membershipOf(b.clubId, applicant.id))!;
    // ใช้ path ของชมรม A กับใบสมัครของชมรม B → ไม่พบ, ใช้ path ของชมรม B → ไม่มีสิทธิ์
    expect((await post(a.president, `/clubs/${a.clubId}/memberships/${id}/approve`)).status).toBe(404);
    expect((await post(a.president, `/clubs/${b.clubId}/memberships/${id}/approve`)).status).toBe(403);
  });

  it('อนุมัติใบสมัครที่ถูกยกเลิกไปแล้ว → 409', async () => {
    const { clubId, president } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    const { id } = (await membershipOf(clubId, applicant.id))!;
    await post(applicant, `/clubs/${clubId}/membership/withdraw`);
    expect((await post(president, `/clubs/${clubId}/memberships/${id}/approve`)).status).toBe(409);
  });
});

describe('ลาออก / ให้พ้นสภาพ', () => {
  it('ยื่นลาออก (ต้องมีเหตุผล) → ยังเป็นสมาชิก รอกรรมการรับทราบ → พ้นสภาพ (เหตุ = ลาออก)', async () => {
    const { clubId, president } = await clubWithCommittee();
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    const path = `/clubs/${clubId}/membership/leave`;

    expect((await post(member, path, {})).status).toBe(400);
    expect((await post(member, path, { note: 'ย้ายไปชมรมอื่น' })).status).toBe(204);
    expect((await post(member, path, { note: 'ซ้ำ' })).body.error.code).toBe('RESIGNATION_ALREADY_REQUESTED');
    const membership = (await membershipOf(clubId, member.id))!;
    expect(membership.status).toBe('active');
    const me = (await get(member, `/clubs/${clubId}`)).body.me;
    expect(me.resignation).toMatchObject({ note: 'ย้ายไปชมรมอื่น' });
    expect(new Date(me.resignation.effectiveAt).getTime() - new Date(me.resignation.requestedAt).getTime()).toBe(30 * 24 * 3600 * 1000);

    const list = (await get(president, `/clubs/${clubId}/resignation-requests`)).body.items;
    expect(list).toMatchObject([{ membershipId: membership.id, note: 'ย้ายไปชมรมอื่น' }]);
    const ack = `/clubs/${clubId}/memberships/${membership.id}/acknowledge-resignation`;
    expect((await post(president, ack, { note: 'ขอบคุณที่ร่วมกิจกรรม' })).status).toBe(204);
    expect(await membershipOf(clubId, member.id)).toMatchObject({ status: 'ended', end_reason: 'resigned' });
    expect((await eventsOf(membership.id)).map((e) => [e.action, e.note])).toEqual([
      ['resign_requested', 'ย้ายไปชมรมอื่น'],
      ['left', 'รับทราบการลาออก: ขอบคุณที่ร่วมกิจกรรม'],
    ]);
    // รับทราบซ้ำไม่ได้
    expect((await post(president, ack)).status).toBe(409);
  });

  it('ยกเลิกคำขอลาออกได้ก่อนมีผล', async () => {
    const { clubId } = await clubWithCommittee();
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    await post(member, `/clubs/${clubId}/membership/leave`, { note: 'ลองดู' });
    expect((await post(member, `/clubs/${clubId}/membership/leave/cancel`)).status).toBe(204);
    expect((await get(member, `/clubs/${clubId}`)).body.me.resignation).toBeNull();
    expect((await post(member, `/clubs/${clubId}/membership/leave/cancel`)).status).toBe(404);
  });

  it('ไม่มีกรรมการรับทราบ → มีผลอัตโนมัติเมื่อครบ 30 วัน (ผู้กระทำ = ระบบ) ยังไม่ครบไม่มีผล', async () => {
    const { clubId } = await clubWithCommittee();
    const [early, due] = [await actor(), await actor()];
    for (const who of [early, due]) {
      await addMembership(clubId, who.id, 'active');
      await post(who, `/clubs/${clubId}/membership/leave`, { note: 'ลาออก' });
    }
    await pool.query(`UPDATE club_memberships SET resign_requested_at = now() - interval '29 days' WHERE user_id = $1`, [early.id]);
    await pool.query(`UPDATE club_memberships SET resign_requested_at = now() - interval '30 days 1 minute' WHERE user_id = $1`, [due.id]);

    expect(await processDueResignations()).toBe(1);
    expect((await membershipOf(clubId, early.id))?.status).toBe('active');
    const ended = (await membershipOf(clubId, due.id))!;
    expect(ended).toMatchObject({ status: 'ended', end_reason: 'resigned' });
    expect((await eventsOf(ended.id)).at(-1)).toMatchObject({ action: 'left', actor_user_id: null });
    expect(await processDueResignations()).toBe(0);
  });

  it('รับทราบการลาออก: ต้องมีสิทธิ์ club_member:approve (เหรัญญิก → 403) และรับทราบของตัวเองไม่ได้', async () => {
    const { clubId, treasurer } = await clubWithCommittee();
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    await post(member, `/clubs/${clubId}/membership/leave`, { note: 'ลาออก' });
    const { id } = (await membershipOf(clubId, member.id))!;
    expect((await get(treasurer, `/clubs/${clubId}/resignation-requests`)).status).toBe(403);
    expect((await post(treasurer, `/clubs/${clubId}/memberships/${id}/acknowledge-resignation`)).status).toBe(403);
    expect((await post(member, `/clubs/${clubId}/memberships/${id}/acknowledge-resignation`)).status).toBe(403);
  });

  it('กรรมการลาออกจากชมรมไม่ได้จนกว่าจะพ้นตำแหน่ง', async () => {
    const { clubId, treasurer } = await clubWithCommittee();
    const res = await post(treasurer, `/clubs/${clubId}/membership/leave`, { note: 'ลาออก' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMMITTEE_MUST_RESIGN_FIRST');
  });

  it('ประธานให้สมาชิกพ้นสภาพได้ ต้องระบุเหตุและคำอธิบาย', async () => {
    const { clubId, president } = await clubWithCommittee();
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    const { id } = (await membershipOf(clubId, member.id))!;

    expect((await post(president, `/clubs/${clubId}/memberships/${id}/remove`, { reason: 'removed_by_resolution' })).status).toBe(400);
    expect((await post(president, `/clubs/${clubId}/memberships/${id}/remove`, { reason: 'resigned', note: 'x' })).status).toBe(400);

    const res = await post(president, `/clubs/${clubId}/memberships/${id}/remove`, {
      reason: 'removed_by_resolution',
      note: 'มติที่ประชุมกรรมการครั้งที่ 1/2569',
    });
    expect(res.status).toBe(204);
    expect(await membershipOf(clubId, member.id)).toMatchObject({ status: 'ended', end_reason: 'removed_by_resolution' });
    expect((await eventsOf(id)).at(-1)).toMatchObject({ action: 'removed', note: 'มติที่ประชุมกรรมการครั้งที่ 1/2569', actor_user_id: president.id });
  });

  it('ให้กรรมการพ้นสภาพสมาชิกไม่ได้ และจัดการสมาชิกภาพของตัวเองไม่ได้', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const treasurerMembership = (await membershipOf(clubId, treasurer.id))!;
    const own = (await membershipOf(clubId, president.id))!;
    const body = { reason: 'removed_by_resolution', note: 'ทดสอบ' };
    expect((await post(president, `/clubs/${clubId}/memberships/${treasurerMembership.id}/remove`, body)).body.error.code).toBe(
      'COMMITTEE_MUST_RESIGN_FIRST',
    );
    expect((await post(president, `/clubs/${clubId}/memberships/${own.id}/remove`, body)).body.error.code).toBe(
      'CANNOT_DECIDE_OWN_MEMBERSHIP',
    );
  });

  it('ประวัติสมาชิกภาพแก้/ลบไม่ได้', async () => {
    const { clubId } = await clubWithCommittee();
    const applicant = await actor();
    await post(applicant, `/clubs/${clubId}/membership`);
    await expect(pool.query("UPDATE club_membership_events SET note = 'x'")).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
  });
});
