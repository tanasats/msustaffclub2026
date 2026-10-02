import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(name: string, email?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, name]);
  for (const role of ['user', 'staff']) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

// ชมรม: ประธาน + สมาชิก 3 คน (1 คนพ้นสภาพแล้ว) + ผู้สมัครที่รออนุมัติ
async function setup() {
  const clubId = await createTestClub({ name: 'ชมรมวิ่ง' });
  const president = await actor('ประธาน ใจดี');
  await addMembership(clubId, president.id, 'active');
  await addCommittee(clubId, president.id, 'president');
  const runner = await actor('นักวิ่ง ขยัน', 'runner@msu.ac.th');
  await addMembership(clubId, runner.id, 'active');
  const walker = await actor('นักเดิน 50%_ช้า');
  await addMembership(clubId, walker.id, 'active');
  const former = await actor('อดีต สมาชิก');
  await addMembership(clubId, former.id, 'active');
  await pool.query(
    `UPDATE club_memberships SET status = 'ended', ended_on = CURRENT_DATE, end_reason = 'resigned' WHERE club_id = $1 AND user_id = $2`,
    [clubId, former.id],
  );
  const applicant = await actor('ผู้สมัคร ใหม่');
  await addMembership(clubId, applicant.id, 'pending');
  const outsider = await actor('คนนอก ชมรม');
  return { clubId, president, runner, walker, former, applicant, outsider };
}

const names = (body: { items: { name: string }[] }) => body.items.map((i) => i.name).sort();

describe('GET /clubs/:clubId/members — ค้นหา/กรองรายชื่อสมาชิก', () => {
  it('ค่าตั้งต้น = สมาชิกปัจจุบัน; กรองพ้นสภาพ/ทั้งหมด/กรรมการ/สมาชิกทั่วไป; ค้นชื่อ/อีเมล; แบ่งหน้า', async () => {
    const s = await setup();
    const list = async (query = '') => (await get(s.president, `/clubs/${s.clubId}/members?${query}`)).body;

    expect(names(await list())).toEqual(['นักวิ่ง ขยัน', 'นักเดิน 50%_ช้า', 'ประธาน ใจดี']);
    expect(names(await list('status=ended'))).toEqual(['อดีต สมาชิก']);
    expect((await list('status=ended')).items[0]).toMatchObject({ status: 'ended', endReason: 'resigned' });
    expect(names(await list('status=all'))).toHaveLength(4); // ไม่รวมผู้สมัครที่รออนุมัติ
    const committee = await list('role=committee');
    expect(committee.items).toMatchObject([{ name: 'ประธาน ใจดี', isCommittee: true, positionTitle: expect.any(String) }]);
    expect(names(await list('role=member'))).toEqual(['นักวิ่ง ขยัน', 'นักเดิน 50%_ช้า']);
    expect(names(await list('q=runner@'))).toEqual(['นักวิ่ง ขยัน']);
    expect(names(await list('q=%25_'))).toEqual(['นักเดิน 50%_ช้า']); // % และ _ ไม่ใช่ wildcard
    const page = await list('pageSize=2&page=2');
    expect(page).toMatchObject({ total: 3, page: 2 });
    expect(page.items).toHaveLength(1);
    expect((await get(s.president, `/clubs/${s.clubId}/members?status=bogus`)).status).toBe(400);
  });

  it('สมาชิกทั่วไป/คนนอกดูรายชื่อไม่ได้ (ต้องมี club:view_internal)', async () => {
    const s = await setup();
    expect((await get(s.runner, `/clubs/${s.clubId}/members`)).status).toBe(403);
    expect((await get(s.outsider, `/clubs/${s.clubId}/members`)).status).toBe(403);
  });
});

describe('GET /clubs/:clubId/members/:userId — ข้อมูลรายบุคคล', () => {
  it('แสดงผลงาน กิจกรรม ตำแหน่ง และประวัติ เฉพาะที่อยู่ในชมรมนี้', async () => {
    const s = await setup();
    const other = await createTestClub({ name: 'ชมรมอื่น' });
    for (const [clubId, title] of [
      [s.clubId, 'ชนะเลิศวิ่ง 10 กม.'],
      [other, 'ผลงานชมรมอื่น'],
    ]) {
      await pool.query(
        `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, status)
         VALUES ($1, $2, $3, DATE '2026-08-01', 'university', 'competition', 'pending')`,
        [clubId, s.runner.id, title],
      );
    }
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO club_activities (club_id, held_on, title, recorded_by) VALUES ($1, DATE '2026-08-02', 'ซ้อมวิ่ง', $2) RETURNING id`,
      [s.clubId, s.president.id],
    );
    await pool.query('INSERT INTO club_activity_participants (activity_id, user_id) VALUES ($1, $2)', [rows[0]!.id, s.runner.id]);

    const res = await get(s.president, `/clubs/${s.clubId}/members/${s.runner.id}`);
    expect(res.status).toBe(200);
    expect(res.body.person).toMatchObject({ name: 'นักวิ่ง ขยัน', status: 'active' });
    expect(res.body.achievements.map((a: { title: string }) => a.title)).toEqual(['ชนะเลิศวิ่ง 10 กม.']);
    expect(res.body.activities).toMatchObject({ total: 1, items: [{ title: 'ซ้อมวิ่ง' }] });
    expect(res.body.positions).toEqual([]);

    const president = (await get(s.president, `/clubs/${s.clubId}/members/${s.president.id}`)).body;
    expect(president.positions).toMatchObject([{ endedOn: null }]);
    // ผู้สมัครที่รออนุมัติ และอดีตสมาชิก ดูได้ (ช่วยตัดสินใจ/ดูประวัติ)
    expect((await get(s.president, `/clubs/${s.clubId}/members/${s.applicant.id}`)).body.person.status).toBe('pending');
    expect((await get(s.president, `/clubs/${s.clubId}/members/${s.former.id}`)).body.person.status).toBe('ended');
  });

  it('บุคลากรที่ไม่เคยเกี่ยวข้องกับชมรม → 404; ไม่มีสิทธิ์ → 403', async () => {
    const s = await setup();
    expect((await get(s.president, `/clubs/${s.clubId}/members/${s.outsider.id}`)).status).toBe(404);
    expect((await get(s.president, `/clubs/${s.clubId}/members/not-a-uuid`)).status).toBe(404);
    expect((await get(s.runner, `/clubs/${s.clubId}/members/${s.walker.id}`)).status).toBe(403);
  });
});

describe('GET /clubs/:clubId/members/export — ส่งออก CSV (club_member:approve)', () => {
  it('ได้ CSV ภาษาไทย (BOM) ตามตัวกรอง กันสูตร Excel และบันทึกการส่งออก', async () => {
    const s = await setup();
    // ชื่อที่ขึ้นต้นด้วย = ต้องไม่ถูก Excel ตีความเป็นสูตร
    await pool.query(`UPDATE users SET name = '=HYPERLINK("x")' WHERE id = $1`, [s.walker.id]);
    const res = await get(s.president, `/clubs/${s.clubId}/members/export?role=member`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="club-members-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers['cache-control']).toBe('no-store');
    const text = res.text;
    expect(text.startsWith('﻿"ลำดับ","ชื่อ-สกุล","อีเมล"')).toBe(true);
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(3); // หัวตาราง + สมาชิกทั่วไป 2 คน (ไม่รวมประธาน)
    expect(text).toContain('"runner@msu.ac.th"');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text).not.toContain('ประธาน ใจดี');

    const { rows } = await pool.query('SELECT exported_by, row_count, filter FROM club_member_exports WHERE club_id = $1', [s.clubId]);
    expect(rows).toEqual([{ exported_by: s.president.id, row_count: 2, filter: { status: 'active', role: 'member', query: null } }]);
    await expect(pool.query('DELETE FROM club_member_exports')).rejects.toThrow();
  });

  it('กรรมการที่ไม่มีสิทธิ์อนุมัติสมาชิก (เหรัญญิก) และสมาชิกทั่วไป → 403 และไม่มีบันทึก', async () => {
    const s = await setup();
    const treasurer = await actor('เหรัญญิก ชมรม');
    await addMembership(s.clubId, treasurer.id, 'active');
    await addCommittee(s.clubId, treasurer.id, 'treasurer');
    expect((await get(treasurer, `/clubs/${s.clubId}/members`)).status).toBe(200); // ดูรายชื่อได้
    expect((await get(treasurer, `/clubs/${s.clubId}/members/export`)).status).toBe(403);
    expect((await get(s.runner, `/clubs/${s.clubId}/members/export`)).status).toBe(403);
    expect((await pool.query('SELECT 1 FROM club_member_exports')).rowCount).toBe(0);
  });
});
