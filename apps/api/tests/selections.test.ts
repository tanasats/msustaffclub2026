import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { bangkokDateString, fiscalYearOf } from '../src/services/fiscal-year.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const FY = fiscalYearOf();
const TODAY = bangkokDateString();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff'], name?: string): Promise<Actor> {
  const user = await createTestUser();
  if (name) await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, name]);
  for (const role of roles) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function sportId(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM sports WHERE code = $1', [code]);
  return rows[0]!.id;
}

async function sportsClub(name: string, sport: string) {
  const clubId = await createTestClub({ name });
  await pool.query("UPDATE clubs SET category_id = (SELECT id FROM club_categories WHERE code = 'health_sports') WHERE id = $1", [clubId]);
  await pool.query('INSERT INTO club_sports (club_id, sport_id, created_by) SELECT $1, $2, id FROM users LIMIT 1', [clubId, sport]);
  return clubId;
}

async function athlete(clubId: string, sport: string, name: string, options: { ended?: boolean } = {}) {
  const who = await actor(['user', 'staff'], name);
  await addMembership(clubId, who.id, 'active');
  await pool.query(
    'INSERT INTO club_athletes (club_id, user_id, sport_id, ended_at, ended_by) VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN $2::uuid END)',
    [clubId, who.id, sport, options.ended ?? false],
  );
  return who;
}

async function result(clubId: string, sport: string, userId: string, rank: number, medal: string | null) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sport_competitions (club_id, sport_id, title, level, held_from, recorded_by)
     VALUES ($1, $2, 'แข่งทดสอบ', 'university', $3::date, $4) RETURNING id`,
    [clubId, sport, TODAY, userId],
  );
  await pool.query('INSERT INTO sport_competition_results (competition_id, user_id, rank, medal) VALUES ($1, $2, $3, $4)', [
    rows[0]!.id,
    userId,
    rank,
    medal,
  ]);
}

// ชมรมวิ่ง 2 ชมรม: A (ทอง), B (เงิน), C (ไม่มีเหรียญ), D (เลิกเป็นนักกีฬาแล้ว — ไม่ใช่ผู้เข้าชิง)
async function setup() {
  const running = await sportId('running');
  const [club1, club2] = [await sportsClub('ชมรมวิ่ง 1', running), await sportsClub('ชมรมวิ่ง 2', running)];
  const a = await athlete(club1, running, 'ก นักวิ่ง');
  const b = await athlete(club2, running, 'ข นักวิ่ง');
  const c = await athlete(club1, running, 'ค นักวิ่ง');
  const d = await athlete(club1, running, 'ง เลิกแล้ว', { ended: true });
  await result(club1, running, a.id, 1, 'gold');
  await result(club2, running, b.id, 2, 'silver');
  const admin = await actor(['user', 'staff', 'super_admin']);
  return { running, club1, club2, a, b, c, d, admin };
}

async function openRound(s: Awaited<ReturnType<typeof setup>>) {
  const res = await post(s.admin, '/selection-rounds', {
    kind: 'representative',
    title: 'คัดเลือกตัวแทนวิ่ง 10 กม. กีฬาบุคลากรแห่งประเทศไทย',
    sportId: s.running,
    eventName: '10 กม.',
    fiscalYear: FY,
    slots: 2,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('สิทธิ์', () => {
  it('เฉพาะ super_admin และ role คณะกรรมการคัดเลือก ใช้ได้ → เจ้าหน้าที่สโมสร/บุคลากร 403', async () => {
    const s = await setup();
    const officer = await actor(['user', 'staff', 'club_officer']);
    const body = { kind: 'representative', title: 'x', sportId: s.running, fiscalYear: FY };
    expect((await post(officer, '/selection-rounds', body)).status).toBe(403);
    expect((await get(s.a, '/selection-rounds')).status).toBe(403);
    expect((await post(s.admin, '/selection-rounds', body)).status).toBe(201);
    // role คณะกรรมการคัดเลือก (ผู้ใช้ยืนยันให้ผูก sport_selection:manage)
    const committee = await actor(['user', 'staff', 'sport_selection_committee']);
    expect((await post(committee, '/selection-rounds', body)).status).toBe(201);
    expect((await get(committee, '/selection-rounds')).status).toBe(200);
  });

  it('ตัวแทนต้องระบุชนิดกีฬา รางวัลต้องไม่ระบุ; ปีงบประมาณเฉพาะปีนี้/ปีที่แล้ว', async () => {
    const s = await setup();
    expect((await post(s.admin, '/selection-rounds', { kind: 'representative', title: 'x', fiscalYear: FY })).body.error.code).toBe('SPORT_REQUIRED');
    expect((await post(s.admin, '/selection-rounds', { kind: 'award', title: 'x', sportId: s.running, fiscalYear: FY })).body.error.code).toBe('SPORT_REQUIRED');
    expect((await post(s.admin, '/selection-rounds', { kind: 'award', title: 'x', fiscalYear: FY - 3 })).body.error.code).toBe('FISCAL_YEAR_OUT_OF_RANGE');
  });
});

describe('ตารางจัดอันดับและการตัดสิน', () => {
  it('ผู้เข้าชิง = นักกีฬาปัจจุบันของชนิดกีฬาจากทุกชมรม เรียงตามเหรียญ', async () => {
    const s = await setup();
    const id = await openRound(s);
    const round = (await get(s.admin, `/selection-rounds/${id}`)).body;
    expect(round.candidates.map((c: { userId: string }) => c.userId)).toEqual([s.a.id, s.b.id, s.c.id]);
    expect(round.candidates[0]).toMatchObject({ gold: 1, bestRank: 1, competitionCount: 1, clubs: ['ชมรมวิ่ง 1'], decision: null });
    expect(round.candidates[1]).toMatchObject({ silver: 1, clubs: ['ชมรมวิ่ง 2'] });
  });

  it('ตัดสินต้องมีเหตุผล เปลี่ยนได้ขณะเปิด; ผู้ไม่ใช่ผู้เข้าชิง → 422; ปิดรอบต้องมีผู้ได้รับคัดเลือก แล้วแก้ไม่ได้', async () => {
    const s = await setup();
    const id = await openRound(s);
    const path = `/selection-rounds/${id}/decisions`;

    expect((await post(s.admin, path, { userId: s.a.id, decision: 'selected' })).status).toBe(400);
    expect((await post(s.admin, path, { userId: s.d.id, decision: 'selected', reason: 'x' })).body.error.code).toBe('NOT_A_CANDIDATE');
    expect((await post(s.admin, `/selection-rounds/${id}/close`)).body.error.code).toBe('NO_SELECTION');

    expect((await post(s.admin, path, { userId: s.a.id, decision: 'reserve', reason: 'รอดูผลสนามถัดไป' })).status).toBe(204);
    expect((await post(s.admin, path, { userId: s.a.id, decision: 'selected', reason: 'เหรียญทองระดับมหาวิทยาลัย' })).status).toBe(204);
    expect((await post(s.admin, path, { userId: s.b.id, decision: 'reserve', reason: 'เหรียญเงิน' })).status).toBe(204);
    expect((await post(s.admin, path, { userId: s.c.id, decision: 'not_selected', reason: 'ยังไม่มีผลการแข่งขัน' })).status).toBe(204);

    const round = (await get(s.admin, `/selection-rounds/${id}`)).body;
    expect(round).toMatchObject({ decidedCount: 3, selectedCount: 1 });
    expect(round.candidates[0]).toMatchObject({ decision: 'selected', reason: 'เหรียญทองระดับมหาวิทยาลัย' });

    expect((await get(s.c, `/selection-rounds/${id}/announcement`)).status).toBe(404);
    expect((await post(s.admin, `/selection-rounds/${id}/close`)).status).toBe(204);
    expect((await post(s.admin, path, { userId: s.c.id, decision: 'selected', reason: 'x' })).body.error.code).toBe('ROUND_CLOSED');

    // ประกาศผล: ทุกคนที่ login เห็นเฉพาะคัดเลือก/สำรอง (ไม่เห็นผู้ไม่ได้รับคัดเลือกและตัวชี้วัด)
    const announcement = (await get(s.c, `/selection-rounds/${id}/announcement`)).body;
    expect(announcement.results.map((r: { userId: string; decision: string }) => [r.userId, r.decision])).toEqual([
      [s.b.id, 'reserve'],
      [s.a.id, 'selected'],
    ]);
    expect(announcement.results[0]).not.toHaveProperty('gold');
    expect((await get(s.c, '/selection-announcements')).body.items).toMatchObject([{ id, selectedCount: 1, sportName: 'วิ่ง' }]);
  });

  it('รอบรางวัล: ผู้เข้าชิงรวมผู้มีผลงานที่รับรองแล้วที่ไม่ได้เป็นนักกีฬา และนับผลงาน', async () => {
    const s = await setup();
    const musician = await actor(['user', 'staff'], 'นักดนตรี');
    const music = await createTestClub({ name: 'ชมรมดนตรี' });
    await addMembership(music, musician.id, 'active');
    await pool.query(
      `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, status, decided_by, decided_at)
       VALUES ($1, $2, 'ชนะเลิศประกวดดนตรี', $3::date, 'national', 'competition', 'approved', $2, now())`,
      [music, musician.id, TODAY],
    );
    const res = await post(s.admin, '/selection-rounds', { kind: 'award', title: 'บุคลากรผู้มีผลงานดีเด่น', fiscalYear: FY });
    const candidates = (await get(s.admin, `/selection-rounds/${res.body.id}`)).body.candidates;
    const byUser = new Map(candidates.map((c: { userId: string }) => [c.userId, c]));
    expect(byUser.get(musician.id)).toMatchObject({ achievementCount: 1, clubs: [] });
    expect(byUser.has(s.a.id)).toBe(true);
    expect(byUser.has(s.d.id)).toBe(false);
  });
});
