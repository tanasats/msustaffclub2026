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

const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function member(clubId: string): Promise<Actor> {
  const who = await actor();
  await addMembership(clubId, who.id, 'active');
  return who;
}

// ชมรมที่มีประธาน (จัดการกรรมการได้) และเหรัญญิก (จัดการไม่ได้) ทั้งคู่เป็นสมาชิก
async function clubWithCommittee() {
  const clubId = await createTestClub();
  const president = await member(clubId);
  const treasurer = await member(clubId);
  await addCommittee(clubId, president.id, 'president');
  await addCommittee(clubId, treasurer.id, 'treasurer');
  return { clubId, president, treasurer };
}

async function currentCommittee(clubId: string) {
  const { rows } = await pool.query<{ id: string; user_id: string; code: string; position_title: string }>(
    `SELECT cm.id, cm.user_id, p.code, cm.position_title FROM club_committee_members cm
       JOIN club_positions p ON p.id = cm.position_id
      WHERE cm.club_id = $1 AND cm.ended_on IS NULL ORDER BY p.sort_order, cm.sort_order`,
    [clubId],
  );
  return rows;
}

async function committeeRowOf(clubId: string, userId: string) {
  const { rows } = await pool.query<{ id: string; ended_on: string | null; end_reason: string | null }>(
    `SELECT id, to_char(ended_on, 'YYYY-MM-DD') AS ended_on, end_reason FROM club_committee_members
      WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [clubId, userId],
  );
  return rows[0]!;
}

async function eventsOf(committeeMemberId: string) {
  const { rows } = await pool.query<{ action: string; note: string | null; actor_user_id: string | null }>(
    'SELECT action, note, actor_user_id FROM club_committee_events WHERE committee_member_id = $1 ORDER BY created_at, id',
    [committeeMemberId],
  );
  return rows;
}

describe('แต่งตั้งกรรมการ', () => {
  it('ประธานแต่งตั้งสมาชิกเป็นกรรมการได้ → ได้สิทธิ์ชมรมตามตำแหน่งทันที พร้อมประวัติ', async () => {
    const { clubId, president } = await clubWithCommittee();
    const newcomer = await member(clubId);
    expect((await get(newcomer, `/clubs/${clubId}/members`)).status).toBe(403);

    const res = await post(president, `/clubs/${clubId}/committee`, {
      userId: newcomer.id,
      positionCode: 'committee_member',
      positionTitle: 'ฝ่ายสวัสดิการ',
      contactPhone: '0800000002',
      note: 'ผลการเลือกตั้ง 1/2569',
    });

    expect(res.status).toBe(201);
    expect((await currentCommittee(clubId)).find((c) => c.user_id === newcomer.id)).toMatchObject({
      code: 'committee_member',
      position_title: 'ฝ่ายสวัสดิการ',
    });
    expect(await eventsOf(res.body.id)).toEqual([{ action: 'appointed', note: 'ผลการเลือกตั้ง 1/2569', actor_user_id: president.id }]);
    // สิทธิ์ชมรมมาจากตำแหน่ง จึงมีผลทันที
    expect((await get(newcomer, `/clubs/${clubId}/members`)).status).toBe(200);
  });

  it('ไม่ระบุชื่อตำแหน่ง → ใช้ชื่อมาตรฐาน และรองประธานคนถัดไปได้ลำดับต่อท้าย', async () => {
    const { clubId, president } = await clubWithCommittee();
    const [a, b] = [await member(clubId), await member(clubId)];
    await post(president, `/clubs/${clubId}/committee`, { userId: a.id, positionCode: 'vice_president' });
    await post(president, `/clubs/${clubId}/committee`, { userId: b.id, positionCode: 'vice_president' });

    const { rows } = await pool.query<{ user_id: string; position_title: string; sort_order: number }>(
      `SELECT user_id, position_title, sort_order FROM club_committee_members
        WHERE club_id = $1 AND user_id = ANY($2::uuid[]) ORDER BY sort_order`,
      [clubId, [a.id, b.id]],
    );
    expect(rows).toEqual([
      { user_id: a.id, position_title: 'รองประธานชมรม', sort_order: 1 },
      { user_id: b.id, position_title: 'รองประธานชมรม', sort_order: 2 },
    ]);
  });

  it('ต้องเป็นสมาชิก active, ไม่ใช่กรรมการอยู่แล้ว, ไม่ใช่ที่ปรึกษา และไม่ใช่ตัวเอง', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const outsider = await actor();
    const pending = await actor();
    await addMembership(clubId, pending.id, 'pending');
    const advisor = await member(clubId);
    await addAdvisor(clubId, advisor.id);

    const appoint = (userId: string, positionCode = 'secretary') =>
      post(president, `/clubs/${clubId}/committee`, { userId, positionCode }).then((r) => r.body.error?.code);

    expect(await appoint(outsider.id)).toBe('NOT_ACTIVE_MEMBER');
    expect(await appoint(pending.id)).toBe('NOT_ACTIVE_MEMBER');
    expect(await appoint(treasurer.id)).toBe('ALREADY_COMMITTEE');
    expect(await appoint(advisor.id)).toBe('ADVISOR_CANNOT_BE_COMMITTEE');
    expect(await appoint(president.id)).toBe('CANNOT_MANAGE_OWN_POSITION');
  });

  it('ตำแหน่งต้องเป็นตำแหน่งกรรมการ และประธานต้องใช้การโอนตำแหน่ง', async () => {
    const { clubId, president } = await clubWithCommittee();
    const newcomer = await member(clubId);
    const appoint = (positionCode: string) =>
      post(president, `/clubs/${clubId}/committee`, { userId: newcomer.id, positionCode }).then((r) => r.body.error?.code);

    expect(await appoint('member')).toBe('POSITION_NOT_FOUND');
    expect(await appoint('no_such_position')).toBe('POSITION_NOT_FOUND');
    expect(await appoint('president')).toBe('USE_PRESIDENCY_TRANSFER');
  });

  it('เคารพจำนวนสูงสุดต่อชมรม (max_per_club)', async () => {
    const { clubId, president } = await clubWithCommittee();
    const [a, b] = [await member(clubId), await member(clubId)];
    await pool.query("UPDATE club_positions SET max_per_club = 1 WHERE code = 'secretary'");
    try {
      expect((await post(president, `/clubs/${clubId}/committee`, { userId: a.id, positionCode: 'secretary' })).status).toBe(201);
      const res = await post(president, `/clubs/${clubId}/committee`, { userId: b.id, positionCode: 'secretary' });
      expect(res.body.error.code).toBe('POSITION_LIMIT_EXCEEDED');
    } finally {
      await pool.query("UPDATE club_positions SET max_per_club = NULL WHERE code = 'secretary'");
    }
  });

  it('ตำแหน่งที่ไม่มีสิทธิ์ (เหรัญญิก) และประธานชมรมอื่น → 403, ชมรมถูกระงับ → 409', async () => {
    const { clubId, treasurer } = await clubWithCommittee();
    const other = await clubWithCommittee();
    const newcomer = await member(clubId);
    const body = { userId: newcomer.id, positionCode: 'secretary' };

    expect((await post(treasurer, `/clubs/${clubId}/committee`, body)).status).toBe(403);
    expect((await post(other.president, `/clubs/${clubId}/committee`, body)).status).toBe(403);

    await pool.query("UPDATE clubs SET status = 'suspended' WHERE id = $1", [other.clubId]);
    const suspendedMember = await member(other.clubId);
    const res = await post(other.president, `/clubs/${other.clubId}/committee`, { userId: suspendedMember.id, positionCode: 'secretary' });
    expect(res.body.error.code).toBe('CLUB_NOT_ACTIVE');
  });
});

describe('พ้นตำแหน่ง', () => {
  it('ประธานให้กรรมการพ้นตำแหน่งได้ ต้องระบุเหตุและคำอธิบาย → ยังเป็นสมาชิกต่อ', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const { id } = await committeeRowOf(clubId, treasurer.id);
    const path = `/clubs/${clubId}/committee/${id}/end`;

    expect((await post(president, path, { reason: 'term_ended' })).status).toBe(400);
    expect((await post(president, path, { reason: 'replaced', note: 'x' })).status).toBe(400);
    expect((await post(president, path, { reason: 'removed_by_resolution', note: 'มติที่ประชุม 2/2569' })).status).toBe(204);

    expect(await committeeRowOf(clubId, treasurer.id)).toMatchObject({ end_reason: 'removed_by_resolution' });
    expect((await eventsOf(id)).at(-1)).toEqual({ action: 'ended', note: 'มติที่ประชุม 2/2569', actor_user_id: president.id });
    const page = (await get(treasurer, `/clubs/${clubId}`)).body;
    expect(page.me).toMatchObject({ membershipStatus: 'active', positions: [] });
    // พ้นตำแหน่งแล้วจึงลาออกจากชมรมได้
    expect((await post(treasurer, `/clubs/${clubId}/membership/leave`)).status).toBe(204);
  });

  it('ให้ประธานพ้นตำแหน่งไม่ได้ (ต้องโอนตำแหน่ง) และให้ตัวเองพ้นตำแหน่งผ่านเมนูนี้ไม่ได้', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const admin = await actor(['user', 'staff', 'super_admin']);
    await addMembership(clubId, admin.id, 'active');
    await addCommittee(clubId, admin.id, 'secretary');
    const body = { reason: 'term_ended', note: 'ครบวาระ' };

    const presidentRow = await committeeRowOf(clubId, president.id);
    expect((await post(admin, `/clubs/${clubId}/committee/${presidentRow.id}/end`, body)).body.error.code).toBe('PRESIDENT_MUST_TRANSFER');
    const own = await committeeRowOf(clubId, admin.id);
    expect((await post(admin, `/clubs/${clubId}/committee/${own.id}/end`, body)).body.error.code).toBe('CANNOT_MANAGE_OWN_POSITION');
    // ตำแหน่งที่สิ้นสุดแล้ว → ไม่พบ
    const treasurerRow = await committeeRowOf(clubId, treasurer.id);
    await post(president, `/clubs/${clubId}/committee/${treasurerRow.id}/end`, body);
    expect((await post(president, `/clubs/${clubId}/committee/${treasurerRow.id}/end`, body)).status).toBe(404);
  });

  it('กรรมการลาออกจากตำแหน่งเองได้ ประธานลาออกไม่ได้ ผู้ที่ไม่ใช่กรรมการ → 404', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const plain = await member(clubId);

    expect((await post(treasurer, `/clubs/${clubId}/committee/resign`, { note: 'ย้ายหน่วยงาน' })).status).toBe(204);
    const row = await committeeRowOf(clubId, treasurer.id);
    expect(row.end_reason).toBe('resigned_position');
    expect((await eventsOf(row.id)).at(-1)).toEqual({ action: 'ended', note: 'ย้ายหน่วยงาน', actor_user_id: treasurer.id });

    expect((await post(president, `/clubs/${clubId}/committee/resign`)).body.error.code).toBe('PRESIDENT_MUST_TRANSFER');
    expect((await post(plain, `/clubs/${clubId}/committee/resign`)).status).toBe(404);
  });
});

describe('โอนตำแหน่งประธาน', () => {
  it('ประธานโอนให้กรรมการคนอื่น → ตำแหน่งเดิมของทั้งสองสิ้นสุด (replaced) และสิทธิ์ย้ายตามทันที', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const newcomer = await member(clubId);

    const res = await post(president, `/clubs/${clubId}/committee/transfer-presidency`, { userId: treasurer.id, note: 'มติเลือกตั้ง' });
    expect(res.status).toBe(204);

    const current = await currentCommittee(clubId);
    expect(current.map((c) => [c.user_id, c.code])).toEqual([[treasurer.id, 'president']]);
    const oldPresident = await committeeRowOf(clubId, president.id);
    expect(oldPresident.end_reason).toBe('replaced');
    expect((await eventsOf(oldPresident.id)).at(-1)).toMatchObject({ action: 'ended', note: 'มติเลือกตั้ง', actor_user_id: president.id });
    const { rows } = await pool.query<{ end_reason: string }>(
      `SELECT end_reason FROM club_committee_members cm JOIN club_positions p ON p.id = cm.position_id
        WHERE cm.club_id = $1 AND cm.user_id = $2 AND p.code = 'treasurer'`,
      [clubId, treasurer.id],
    );
    expect(rows[0]?.end_reason).toBe('replaced');

    // ประธานเดิมหมดสิทธิ์ ประธานใหม่ได้สิทธิ์
    const body = { userId: newcomer.id, positionCode: 'secretary' };
    expect((await post(president, `/clubs/${clubId}/committee`, body)).status).toBe(403);
    expect((await post(treasurer, `/clubs/${clubId}/committee`, body)).status).toBe(201);
    // ประธานเดิมยังเป็นสมาชิก และลาออกจากชมรมได้แล้ว
    expect((await post(president, `/clubs/${clubId}/membership/leave`)).status).toBe(204);
  });

  it('ผู้รับต้องเป็นสมาชิก active ที่ไม่ใช่ตัวเอง', async () => {
    const { clubId, president } = await clubWithCommittee();
    const outsider = await actor();
    const path = `/clubs/${clubId}/committee/transfer-presidency`;
    expect((await post(president, path, { userId: outsider.id })).body.error.code).toBe('NOT_ACTIVE_MEMBER');
    expect((await post(president, path, { userId: president.id })).body.error.code).toBe('CANNOT_MANAGE_OWN_POSITION');
  });

  it('ผู้มี club:manage_all แต่งตั้งประธานได้แม้ชมรมไม่มีประธานอยู่', async () => {
    const clubId = await createTestClub();
    const admin = await actor(['user', 'super_admin']);
    const target = await member(clubId);

    expect((await post(admin, `/clubs/${clubId}/committee/transfer-presidency`, { userId: target.id })).status).toBe(204);
    expect((await currentCommittee(clubId)).map((c) => [c.user_id, c.code])).toEqual([[target.id, 'president']]);
  });

  it('โอนตำแหน่งพร้อมกัน 2 รายการ → ประธานเหลือ 1 คน และรายการที่ 2 ถูกปฏิเสธเพราะผู้โอนหมดสิทธิ์แล้ว', async () => {
    const { clubId, president } = await clubWithCommittee();
    const [a, b] = [await member(clubId), await member(clubId)];
    const path = `/clubs/${clubId}/committee/transfer-presidency`;

    const results = await Promise.all([post(president, path, { userId: a.id }), post(president, path, { userId: b.id })]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 403]);
    const presidents = (await currentCommittee(clubId)).filter((c) => c.code === 'president');
    expect(presidents).toHaveLength(1);
  });
});

describe('ข้อมูลกรรมการในหน้าชมรมและประวัติ', () => {
  it('หน้าชมรมส่ง id ของตำแหน่ง และผู้มี club:view_internal ดูประวัติได้ (ใครให้พ้น/เหตุผล)', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const plain = await member(clubId);
    const row = await committeeRowOf(clubId, treasurer.id);
    expect((await get(president, `/clubs/${clubId}`)).body.committee.map((c: { id: string }) => c.id)).toContain(row.id);

    await post(president, `/clubs/${clubId}/committee/${row.id}/end`, { reason: 'term_ended', note: 'ครบวาระปีงบประมาณ 2569' });

    const history = await get(president, `/clubs/${clubId}/committee/history`);
    expect(history.status).toBe(200);
    expect(history.body.items).toEqual([
      expect.objectContaining({ id: row.id, positionTitle: 'เหรัญญิก', endReason: 'term_ended', endNote: 'ครบวาระปีงบประมาณ 2569' }),
    ]);
    expect(history.body.items[0].endedByName).toBeTruthy();
    expect((await get(plain, `/clubs/${clubId}/committee/history`)).status).toBe(403);
  });

  it('ประวัติกรรมการแก้/ลบไม่ได้', async () => {
    const { clubId, president, treasurer } = await clubWithCommittee();
    const row = await committeeRowOf(clubId, treasurer.id);
    await post(president, `/clubs/${clubId}/committee/${row.id}/end`, { reason: 'term_ended', note: 'ครบวาระ' });
    await expect(pool.query("UPDATE club_committee_events SET note = 'x'")).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
    await expect(pool.query('DELETE FROM club_committee_events')).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
  });
});
