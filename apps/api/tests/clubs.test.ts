import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

async function actor(roles: string[] = ['user', 'staff']) {
  const user = await createTestUser();
  for (const role of roles) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const get = (cookie: string, path: string) => request(app).get(path).set('Cookie', cookie);

async function setCategory(clubId: string, code: string) {
  await pool.query('UPDATE clubs SET category_id = (SELECT id FROM club_categories WHERE code = $2) WHERE id = $1', [clubId, code]);
}

describe('GET /clubs (ทำเนียบชมรม)', () => {
  it('แสดงเฉพาะชมรมที่ดำเนินการอยู่ พร้อมจำนวนสมาชิก เรียงตามชื่อ', async () => {
    const me = await actor();
    const music = await createTestClub({ name: 'ชมรมดนตรี' });
    await createTestClub({ name: 'ชมรมกอล์ฟ' });
    await createTestClub({ name: 'ชมรมที่ถูกระงับ', status: 'suspended' });
    const [a, b] = await Promise.all([createTestUser(), createTestUser()]);
    await addMembership(music, a.id, 'active');
    await addMembership(music, b.id, 'pending');

    const res = await get(me.cookie, '/clubs');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((c: { nameTh: string; memberCount: number }) => [c.nameTh, c.memberCount])).toEqual([
      ['ชมรมกอล์ฟ', 0],
      ['ชมรมดนตรี', 1],
    ]);
  });

  it('ค้นหาชื่อ กรองประเภท และบอกสถานะสมาชิกของฉัน', async () => {
    const me = await actor();
    const music = await createTestClub({ name: 'ชมรมดนตรีไทย' });
    const run = await createTestClub({ name: 'ชมรมวิ่ง' });
    await setCategory(run, 'health_sports');
    await addMembership(music, me.id, 'pending');

    expect((await get(me.cookie, '/clubs?q=ดนตรี')).body.items).toMatchObject([{ nameTh: 'ชมรมดนตรีไทย', myMembershipStatus: 'pending' }]);
    expect((await get(me.cookie, '/clubs?category=health_sports')).body.items.map((c: { nameTh: string }) => c.nameTh)).toEqual(['ชมรมวิ่ง']);
    expect((await get(me.cookie, '/clubs?q=%25')).body.items).toEqual([]);
  });

  it('?mine=1 = ชมรมที่ฉันเป็นสมาชิก กรรมการ หรือที่ปรึกษา (ไม่รวมใบสมัครที่รออนุมัติ)', async () => {
    const me = await actor();
    const asMember = await createTestClub({ name: 'ก ชมรมที่เป็นสมาชิก' });
    const asCommittee = await createTestClub({ name: 'ข ชมรมที่เป็นกรรมการ' });
    const asAdvisor = await createTestClub({ name: 'ค ชมรมที่เป็นที่ปรึกษา' });
    const pendingOnly = await createTestClub({ name: 'ง ชมรมที่รออนุมัติ' });
    await createTestClub({ name: 'จ ชมรมอื่น' });
    await addMembership(asMember, me.id, 'active');
    await addCommittee(asCommittee, me.id, 'treasurer');
    await addAdvisor(asAdvisor, me.id);
    await addMembership(pendingOnly, me.id, 'pending');

    const res = await get(me.cookie, '/clubs?mine=1');
    expect(res.body.items.map((c: { nameTh: string }) => c.nameTh)).toEqual([
      'ก ชมรมที่เป็นสมาชิก',
      'ข ชมรมที่เป็นกรรมการ',
      'ค ชมรมที่เป็นที่ปรึกษา',
    ]);
  });

  it('ต้อง login', async () => {
    expect((await request(app).get('/clubs')).status).toBe(401);
  });
});

describe('GET /clubs/:clubId (หน้าชมรม)', () => {
  async function clubWithPeople() {
    const clubId = await createTestClub({ name: 'ชมรมดนตรี' });
    const president = await actor();
    const member = await actor();
    const advisorUser = await createTestUser();
    await addCommittee(clubId, president.id, 'president');
    await pool.query("UPDATE club_committee_members SET contact_phone = '0800000000' WHERE club_id = $1", [clubId]);
    await addMembership(clubId, president.id, 'active');
    await addMembership(clubId, member.id, 'active');
    await addAdvisor(clubId, advisorUser.id);
    return { clubId, president, member };
  }

  it('ผู้ใช้ทั่วไปเห็นข้อมูลสาธารณะ แต่ไม่เห็นเบอร์โทร/อีเมลของกรรมการและที่ปรึกษา', async () => {
    const { clubId } = await clubWithPeople();
    const outsider = await actor();

    const res = await get(outsider.cookie, `/clubs/${clubId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nameTh: 'ชมรมดนตรี', memberCount: 2, me: { membershipStatus: null, positions: [], permissions: [] } });
    expect(res.body.committee[0]).toMatchObject({ positionCode: 'president' });
    expect(res.body.committee[0]).not.toHaveProperty('contactPhone');
    expect(res.body.advisors[0]).not.toHaveProperty('email');
  });

  it('กรรมการเห็นข้อมูลภายใน และรู้ตำแหน่ง/สิทธิ์ของตัวเอง', async () => {
    const { clubId, president } = await clubWithPeople();
    const res = await get(president.cookie, `/clubs/${clubId}`);
    expect(res.body.committee[0]).toMatchObject({ contactPhone: '0800000000' });
    expect(res.body.me).toMatchObject({ membershipStatus: 'active', positions: ['ประธานชมรม'] });
    expect(res.body.me.permissions).toContain('club_member:approve');
  });

  it('รายชื่อสมาชิก: กรรมการดูได้ สมาชิกทั่วไปดูไม่ได้ (403)', async () => {
    const { clubId, president, member } = await clubWithPeople();
    const res = await get(president.cookie, `/clubs/${clubId}/members`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect((await get(member.cookie, `/clubs/${clubId}/members`)).status).toBe(403);
  });

  it('ไม่พบชมรม → 404', async () => {
    const me = await actor();
    expect((await get(me.cookie, '/clubs/01900000-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await get(me.cookie, '/clubs/not-a-uuid')).status).toBe(404);
  });
});
