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

const send = (method: 'post' | 'put', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function sportId(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM sports WHERE code = $1', [code]);
  return rows[0]!.id;
}

// ชมรมประเภทกีฬา: ผู้จัดการทีม (club_sport:manage), เหรัญญิก (ไม่มี), สมาชิก 1 คน
async function setup() {
  const clubId = await createTestClub({ name: 'ชมรมฟุตบอลบุคลากร' });
  await pool.query("UPDATE clubs SET category_id = (SELECT id FROM club_categories WHERE code = 'health_sports') WHERE id = $1", [clubId]);
  const [manager, treasurer, member] = [await actor(), await actor(), await actor()];
  await addMembership(clubId, manager.id, 'active');
  await addCommittee(clubId, manager.id, 'team_manager');
  await addMembership(clubId, treasurer.id, 'active');
  await addCommittee(clubId, treasurer.id, 'treasurer');
  await addMembership(clubId, member.id, 'active');
  return { clubId, manager, treasurer, member };
}

describe('ชนิดกีฬา (ข้อมูลหลัก)', () => {
  it('ทุกคนที่ login เห็นรายการ; เจ้าหน้าที่สโมสร (sport:manage) เพิ่ม/ปิดใช้งานได้; คนอื่น → 403', async () => {
    const officer = await actor(['user', 'staff', 'club_officer']);
    const staff = await actor();
    expect((await get(staff, '/sports')).body.items.map((s: { code: string }) => s.code)).toContain('football');

    expect((await send('post', staff, '/sports', { code: 'test_rugby', nameTh: 'รักบี้' })).status).toBe(403);
    const created = await send('post', officer, '/sports', { code: 'test_rugby', nameTh: 'รักบี้' });
    expect(created.status).toBe(201);
    expect((await send('post', officer, '/sports', { code: 'test_rugby', nameTh: 'ซ้ำ' })).body.error.code).toBe('SPORT_CODE_TAKEN');

    expect((await send('put', officer, `/sports/${created.body.id}`, { nameTh: 'รักบี้ฟุตบอล', isActive: false })).status).toBe(204);
    expect((await get(staff, '/sports')).body.items.map((s: { code: string }) => s.code)).not.toContain('test_rugby');
    expect((await get(officer, '/sports')).body.items.find((s: { code: string }) => s.code === 'test_rugby')).toMatchObject({ isActive: false });
  });
});

describe('ชนิดกีฬาของชมรม', () => {
  it('ผู้จัดการทีมเลือกชนิดกีฬาได้ (เฉพาะชมรมประเภทกีฬา); เหรัญญิก → 403', async () => {
    const { clubId, manager, treasurer } = await setup();
    const [football, futsal] = [await sportId('football'), await sportId('futsal')];

    expect((await send('put', treasurer, `/clubs/${clubId}/sports`, { sportIds: [football] })).status).toBe(403);
    expect((await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [football, futsal] })).status).toBe(204);
    const res = await get(treasurer, `/clubs/${clubId}/sports`);
    expect(res.body).toMatchObject({ enabled: true });
    expect(res.body.items.map((s: { code: string }) => s.code)).toEqual(['football', 'futsal']);

    const music = await createTestClub({ name: 'ชมรมดนตรี' });
    await addMembership(music, manager.id, 'active');
    await addCommittee(music, manager.id, 'president');
    expect((await get(manager, `/clubs/${music}/sports`)).body.enabled).toBe(false);
    expect((await send('put', manager, `/clubs/${music}/sports`, { sportIds: [football] })).body.error.code).toBe('NOT_SPORTS_CLUB');
  });

  it('เอาชนิดกีฬาที่ยังมีนักกีฬาออกไม่ได้', async () => {
    const { clubId, manager, member } = await setup();
    const football = await sportId('football');
    await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [football] });
    await send('post', member, `/clubs/${clubId}/athletes`, { sportId: football });
    const res = await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [] });
    expect(res.body.error.code).toBe('SPORT_HAS_ATHLETES');
  });
});

describe('นักกีฬา', () => {
  it('สมาชิกลงทะเบียนเป็นนักกีฬาของชนิดกีฬาในชมรมได้ ครั้งเดียวต่อชนิด; คนนอก/กีฬาที่ชมรมไม่ได้เลือก → ปฏิเสธ', async () => {
    const { clubId, manager, member } = await setup();
    const outsider = await actor();
    const [football, running] = [await sportId('football'), await sportId('running')];
    await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [football] });
    const path = `/clubs/${clubId}/athletes`;

    expect((await send('post', member, path, { sportId: football, eventOrPosition: 'ผู้รักษาประตู' })).status).toBe(201);
    expect((await send('post', member, path, { sportId: football })).body.error.code).toBe('ALREADY_ATHLETE');
    expect((await send('post', member, path, { sportId: running })).body.error.code).toBe('SPORT_NOT_IN_CLUB');
    expect((await send('post', outsider, path, { sportId: football })).body.error.code).toBe('NOT_ACTIVE_MEMBER');

    const roster = await get(manager, path);
    expect(roster.body.items).toMatchObject([{ userId: member.id, sportName: 'ฟุตบอล', eventOrPosition: 'ผู้รักษาประตู' }]);
    // วันที่เริ่มเป็นนักกีฬาเป็นวันที่ (ไม่ใช่ timestamp) ให้หน้าเว็บจัดรูปแบบได้
    expect(roster.body.items[0].since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await get(outsider, path)).status).toBe(403);
  });

  it('เจ้าตัวแก้ประเภท/เลิกได้, ผู้จัดการทีมให้พ้นได้, สมาชิกคนอื่นแก้ไม่ได้', async () => {
    const { clubId, manager, member, treasurer } = await setup();
    const football = await sportId('football');
    await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [football] });
    const { body } = await send('post', member, `/clubs/${clubId}/athletes`, { sportId: football });

    expect((await send('put', member, `/athletes/${body.id}`, { eventOrPosition: 'กองหลัง' })).status).toBe(204);
    expect((await send('put', treasurer, `/athletes/${body.id}`, { eventOrPosition: 'x' })).status).toBe(404);
    expect((await send('post', manager, `/athletes/${body.id}/end`)).status).toBe(204);

    const { rows } = await pool.query('SELECT event_or_position, ended_by FROM club_athletes WHERE id = $1', [body.id]);
    expect(rows[0]).toEqual({ event_or_position: 'กองหลัง', ended_by: manager.id });
    // ให้พ้นแล้ว ลงทะเบียนใหม่ได้
    expect((await send('post', member, `/clubs/${clubId}/athletes`, { sportId: football })).status).toBe(201);
  });

  it('ลาออกจากชมรม → สิ้นสุดการเป็นนักกีฬาในชมรมนั้นอัตโนมัติ', async () => {
    const { clubId, manager, member } = await setup();
    const football = await sportId('football');
    await send('put', manager, `/clubs/${clubId}/sports`, { sportIds: [football] });
    await send('post', member, `/clubs/${clubId}/athletes`, { sportId: football });

    expect((await send('post', member, `/clubs/${clubId}/membership/leave`)).status).toBe(204);
    expect((await get(manager, `/clubs/${clubId}/athletes`)).body.items).toEqual([]);
  });
});
