import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { bangkokDateString } from '../src/services/fiscal-year.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const TODAY = bangkokDateString();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff']): Promise<Actor> {
  const user = await createTestUser();
  for (const role of roles) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const send = (method: 'post' | 'put' | 'delete', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function sportId(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM sports WHERE code = $1', [code]);
  return rows[0]!.id;
}

/**
 * ชมรมวิ่ง: ผู้จัดการทีม (club_sport:manage) + นักวิ่ง 2 คน (a, b) + สมาชิกที่ไม่ใช่นักกีฬา
 * ค่าสถิติวิ่ง: เวลา (นาที, ค่าน้อยดีกว่า) สร้างโดยเจ้าหน้าที่สโมสร (sport:manage)
 */
async function setup() {
  const clubId = await createTestClub({ name: 'ชมรมวิ่งเพื่อสุขภาพ' });
  await pool.query("UPDATE clubs SET category_id = (SELECT id FROM club_categories WHERE code = 'health_sports') WHERE id = $1", [clubId]);
  const [manager, a, b, plain] = [await actor(), await actor(), await actor(), await actor()];
  await addMembership(clubId, manager.id, 'active');
  await addCommittee(clubId, manager.id, 'team_manager');
  for (const who of [a, b, plain]) await addMembership(clubId, who.id, 'active');
  const running = await sportId('running');
  await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [running] });
  for (const who of [a, b]) await send('post', who, `/clubs/${clubId}/athletes`, { sportId: running, eventOrPosition: '10 กม.' });

  const officer = await actor(['user', 'staff', 'club_officer']);
  const stat = await send('post', officer, `/sports/${running}/stats`, { code: 'test_time', nameTh: 'เวลา', unit: 'นาที', better: 'lower' });
  expect(stat.status).toBe(201);
  return { clubId, manager, a, b, plain, officer, running, timeStat: stat.body.id as string };
}

function competition(s: Awaited<ReturnType<typeof setup>>, overrides: object = {}) {
  return {
    sportId: s.running,
    title: 'มินิมาราธอนบุคลากรมหาวิทยาลัย',
    eventName: '10 กม. ชาย',
    level: 'university',
    format: 'individual',
    heldFrom: TODAY,
    organizer: 'สโมสรบุคลากร',
    results: [
      { userId: s.a.id, rank: 1, medal: 'gold', stats: [{ statId: s.timeStat, value: 48.5 }] },
      { userId: s.b.id, rank: 3, medal: 'bronze', stats: [{ statId: s.timeStat, value: 52.25 }] },
    ],
    ...overrides,
  };
}

describe('ค่าสถิติของชนิดกีฬา', () => {
  it('เจ้าหน้าที่สโมสรกำหนดได้ (รหัสซ้ำไม่ได้), คนอื่น → 403, ทุกคนที่ login เห็นรายการ', async () => {
    const s = await setup();
    expect((await send('post', s.manager, `/sports/${s.running}/stats`, { code: 'test_pace', nameTh: 'เพซ', better: 'lower' })).status).toBe(403);
    expect((await send('post', s.officer, `/sports/${s.running}/stats`, { code: 'test_time', nameTh: 'ซ้ำ', better: 'lower' })).body.error.code).toBe(
      'STAT_CODE_TAKEN',
    );
    // ข้อมูลหลักอาจมีค่าสถิติอื่นอยู่แล้ว จึงหาเฉพาะค่าที่ test สร้าง
    const items = (await get(s.plain, `/sports/${s.running}/stats`)).body.items as { code: string }[];
    expect(items.find((i) => i.code === 'test_time')).toMatchObject({ unit: 'นาที', better: 'lower' });
  });
});

describe('บันทึกการแข่งขัน', () => {
  it('ผู้จัดการทีมบันทึกผลพร้อมสถิติได้; ทุกคนเห็นอันดับ/เหรียญ แต่ค่าสถิติเห็นเฉพาะเจ้าตัวและผู้ดูข้อมูลภายใน', async () => {
    const s = await setup();
    const outsider = await actor();
    const res = await send('post', s.manager, `/clubs/${s.clubId}/competitions`, competition(s));
    expect(res.status).toBe(201);

    const list = (await get(outsider, `/clubs/${s.clubId}/competitions`)).body.items;
    expect(list).toMatchObject([{ id: res.body.id, participantCount: 2, gold: 1, silver: 0, bronze: 1 }]);

    const publicView = (await get(outsider, `/competitions/${res.body.id}`)).body;
    expect(publicView.results.map((r: { rank: number; medal: string }) => [r.rank, r.medal])).toEqual([
      [1, 'gold'],
      [3, 'bronze'],
    ]);
    expect(publicView.results.every((r: object) => !('stats' in r))).toBe(true);

    const ownView = (await get(s.b, `/competitions/${res.body.id}`)).body.results;
    expect(ownView.find((r: { userId: string }) => r.userId === s.b.id).stats).toMatchObject([{ nameTh: 'เวลา', value: 52.25 }]);
    expect(ownView.find((r: { userId: string }) => r.userId === s.a.id)).not.toHaveProperty('stats');

    const managerView = (await get(s.manager, `/competitions/${res.body.id}`)).body;
    expect(managerView.results.every((r: { stats?: unknown[] }) => r.stats?.length === 1)).toBe(true);
    expect(managerView.me.canManage).toBe(true);
  });

  it('ตรวจข้อมูล: ไม่มีสิทธิ์ / ไม่ใช่นักกีฬา / สถิติของกีฬาอื่น / นักกีฬาซ้ำ / วันที่ในอนาคต', async () => {
    const s = await setup();
    const path = `/clubs/${s.clubId}/competitions`;
    const footballStat = await send('post', s.officer, `/sports/${await sportId('football')}/stats`, { code: 'test_goals', nameTh: 'ประตู', better: 'higher' });

    expect((await send('post', s.a, path, competition(s))).status).toBe(403);
    expect((await send('post', s.manager, path, competition(s, { results: [{ userId: s.plain.id }] }))).body.error.code).toBe('NOT_AN_ATHLETE');
    expect(
      (await send('post', s.manager, path, competition(s, { results: [{ userId: s.a.id, stats: [{ statId: footballStat.body.id, value: 2 }] }] }))).body.error
        .code,
    ).toBe('STAT_NOT_FOUND');
    expect((await send('post', s.manager, path, competition(s, { results: [{ userId: s.a.id }, { userId: s.a.id }] }))).body.error.code).toBe(
      'DUPLICATE_ATHLETE',
    );
    expect((await send('post', s.manager, path, competition(s, { heldFrom: '2099-01-01' }))).body.error.code).toBe('HELD_IN_FUTURE');
    expect((await send('post', s.manager, path, competition(s, { sportId: await sportId('football') }))).body.error.code).toBe('SPORT_NOT_IN_CLUB');
  });

  it('แก้ไขผลแทนที่ทั้งชุด และลบการแข่งขันแล้วไม่แสดง', async () => {
    const s = await setup();
    const { body } = await send('post', s.manager, `/clubs/${s.clubId}/competitions`, competition(s));
    const edited = competition(s, { results: [{ userId: s.b.id, rank: 2, medal: 'silver' }] });
    expect((await send('put', s.manager, `/competitions/${body.id}`, edited)).status).toBe(204);
    expect((await get(s.manager, `/competitions/${body.id}`)).body.results).toMatchObject([{ userId: s.b.id, rank: 2, medal: 'silver', stats: [] }]);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sport_result_stats');
    expect(rows[0].n).toBe(0);

    expect((await send('delete', s.manager, `/competitions/${body.id}`)).status).toBe(204);
    expect((await get(s.manager, `/competitions/${body.id}`)).status).toBe(404);
    expect((await get(s.manager, `/clubs/${s.clubId}/competitions`)).body.items).toEqual([]);
  });
});

describe('สรุปนักกีฬา', () => {
  it('สถิติดีที่สุดเลือกตาม "ค่าน้อยดีกว่า", นับเหรียญและการเข้าร่วมกิจกรรม; เห็นเฉพาะเจ้าตัว/ผู้ดูข้อมูลภายใน', async () => {
    const s = await setup();
    await send('post', s.manager, `/clubs/${s.clubId}/competitions`, competition(s));
    await send('post', s.manager, `/clubs/${s.clubId}/competitions`, competition(s, {
      title: 'วิ่งการกุศล',
      results: [{ userId: s.a.id, rank: 2, medal: 'silver', stats: [{ statId: s.timeStat, value: 50 }] }],
    }));
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO club_activities (club_id, held_on, title, recorded_by) VALUES ($1, $2::date, 'ซ้อมวิ่ง', $3) RETURNING id`,
      [s.clubId, TODAY, s.manager.id],
    );
    await pool.query('INSERT INTO club_activity_participants (activity_id, user_id) VALUES ($1, $2)', [rows[0]!.id, s.a.id]);

    const summary = (await get(s.a, `/clubs/${s.clubId}/athletes/${s.a.id}/summary`)).body;
    expect(summary.summary).toEqual({ competitionCount: 2, gold: 1, silver: 1, bronze: 0, bestRank: 1, activityCount: 1 });
    expect(summary.bestStats).toMatchObject([{ nameTh: 'เวลา', better: 'lower', best: 48.5, timesRecorded: 2 }]);
    expect(summary.registrations).toMatchObject([{ sportName: 'วิ่ง', eventOrPosition: '10 กม.' }]);
    expect(summary.competitions.map((c: { title: string }) => c.title).sort()).toEqual(['มินิมาราธอนบุคลากรมหาวิทยาลัย', 'วิ่งการกุศล']);

    expect((await get(s.manager, `/clubs/${s.clubId}/athletes/${s.a.id}/summary`)).status).toBe(200);
    expect((await get(s.b, `/clubs/${s.clubId}/athletes/${s.a.id}/summary`)).status).toBe(404);
  });
});
