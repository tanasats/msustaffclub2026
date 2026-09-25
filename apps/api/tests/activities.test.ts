import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { bangkokDateString, fiscalYearOf } from '../src/services/fiscal-year.js';
import { storage } from '../src/storage/s3-storage.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const FY = fiscalYearOf();
const TODAY = bangkokDateString();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(): Promise<Actor> {
  const user = await createTestUser();
  await grantRole(user.id, 'user');
  await grantRole(user.id, 'staff');
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const send = (method: 'post' | 'put' | 'delete', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

async function uploadPhoto(who: Actor): Promise<string> {
  const ticket = await send('post', who, '/files/uploads', { purpose: 'activity_photo', fileName: 'กิจกรรม.jpg', mimeType: 'image/jpeg', sizeBytes: JPG.length });
  expect(ticket.status).toBe(201);
  expect((await fetch(ticket.body.uploadUrl, { method: 'PUT', headers: ticket.body.headers, body: JPG })).status).toBe(200);
  expect((await send('post', who, `/files/${ticket.body.fileId}/complete`)).status).toBe(200);
  return ticket.body.fileId as string;
}

// ชมรมที่มีเหรัญญิก (มี club_activity:manage) และสมาชิกทั่วไป 2 คน
async function setup() {
  const clubId = await createTestClub();
  const officer = await actor();
  const [m1, m2] = [await actor(), await actor()];
  await addMembership(clubId, officer.id, 'active');
  await addCommittee(clubId, officer.id, 'treasurer');
  for (const m of [m1, m2]) await addMembership(clubId, m.id, 'active');
  return { clubId, officer, m1, m2 };
}

const ACTIVITY = { heldOn: TODAY, title: 'ซ้อมดนตรีประจำสัปดาห์', location: 'หอประชุม', summary: 'ซ้อมเพลงสำหรับงานวันสถาปนา' };

describe('แผนกิจกรรม', () => {
  it('กรรมการเพิ่ม/แก้/ลบรายการในแผนได้ ทุกคนที่ login ดูแผนได้', async () => {
    const { clubId, officer, m1 } = await setup();
    const outsider = await actor();

    const created = await send('post', officer, `/clubs/${clubId}/activity-plans`, {
      fiscalYear: FY,
      plannedDate: TODAY,
      plannedTime: '17.00–19.00 น.',
      title: 'แสดงดนตรีงานวันสถาปนา',
    });
    expect(created.status).toBe(201);
    const planId = created.body.id as string;

    expect((await get(outsider, `/clubs/${clubId}/activity-plans`)).body).toMatchObject({
      fiscalYear: FY,
      items: [{ id: planId, title: 'แสดงดนตรีงานวันสถาปนา', plannedTime: '17.00–19.00 น.', heldCount: 0 }],
    });

    expect((await send('put', officer, `/clubs/${clubId}/activity-plans/${planId}`, { title: 'แสดงดนตรี (แก้ไข)' })).status).toBe(204);
    expect((await send('post', m1, `/clubs/${clubId}/activity-plans`, { fiscalYear: FY, title: 'x' })).status).toBe(403);
    expect((await send('post', officer, `/clubs/${clubId}/activity-plans`, { fiscalYear: FY + 5, title: 'x' })).body.error.code).toBe(
      'FISCAL_YEAR_OUT_OF_RANGE',
    );

    expect((await send('delete', officer, `/clubs/${clubId}/activity-plans/${planId}`)).status).toBe(204);
    expect((await get(outsider, `/clubs/${clubId}/activity-plans`)).body.items).toEqual([]);
  });

  it('แก้/ลบแผนของชมรมอื่นผ่าน path ของชมรมตัวเองไม่ได้ (404)', async () => {
    const a = await setup();
    const b = await setup();
    const { body } = await send('post', b.officer, `/clubs/${b.clubId}/activity-plans`, { fiscalYear: FY, title: 'แผนของชมรม B' });
    expect((await send('delete', a.officer, `/clubs/${a.clubId}/activity-plans/${body.id}`)).status).toBe(404);
    expect((await send('delete', a.officer, `/clubs/${b.clubId}/activity-plans/${body.id}`)).status).toBe(403);
  });
});

describe('บันทึกกิจกรรมที่จัดจริง', () => {
  it('บันทึกพร้อมผู้เข้าร่วม (นับจากรายชื่อ) อ้างอิงแผน และนับจำนวนครั้งที่จัดตามแผน', async () => {
    const { clubId, officer, m1, m2 } = await setup();
    const plan = await send('post', officer, `/clubs/${clubId}/activity-plans`, { fiscalYear: FY, title: 'ซ้อมดนตรี' });

    const res = await send('post', officer, `/clubs/${clubId}/activities`, {
      ...ACTIVITY,
      plannedActivityId: plan.body.id,
      participantUserIds: [m1.id, m2.id],
      participantCount: 99,
    });
    expect(res.status).toBe(201);

    const list = (await get(m1, `/clubs/${clubId}/activities`)).body;
    expect(list.items).toMatchObject([{ id: res.body.id, title: ACTIVITY.title, participantTotal: 2, participantCount: null, plannedTitle: 'ซ้อมดนตรี' }]);
    expect((await get(m1, `/clubs/${clubId}/activity-plans`)).body.items[0].heldCount).toBe(1);
  });

  it('ไม่เลือกรายชื่อ → ใช้จำนวนที่กรอก', async () => {
    const { clubId, officer } = await setup();
    const res = await send('post', officer, `/clubs/${clubId}/activities`, { ...ACTIVITY, participantCount: 35 });
    expect((await get(officer, `/activities/${res.body.id}`)).body).toMatchObject({ participantTotal: 35, participants: [] });
  });

  it('ตรวจข้อมูล: ไม่มีสิทธิ์ / วันที่ในอนาคต / ผู้เข้าร่วมไม่ใช่สมาชิก / แผนของชมรมอื่น', async () => {
    const { clubId, officer, m1 } = await setup();
    const other = await setup();
    const outsider = await actor();
    const otherPlan = await send('post', other.officer, `/clubs/${other.clubId}/activity-plans`, { fiscalYear: FY, title: 'แผน B' });
    const path = `/clubs/${clubId}/activities`;

    expect((await send('post', m1, path, ACTIVITY)).status).toBe(403);
    expect((await send('post', officer, path, { ...ACTIVITY, heldOn: '2099-01-01' })).body.error.code).toBe('HELD_ON_IN_FUTURE');
    expect((await send('post', officer, path, { ...ACTIVITY, participantUserIds: [outsider.id] })).body.error.code).toBe('PARTICIPANT_NOT_MEMBER');
    expect((await send('post', officer, path, { ...ACTIVITY, plannedActivityId: otherPlan.body.id })).body.error.code).toBe('PLAN_NOT_FOUND');
  });

  it('รายชื่อผู้เข้าร่วมและรูปเห็นเฉพาะสมาชิก/ผู้ดูข้อมูลภายใน คนนอกเห็นเฉพาะข้อมูลทั่วไป', async () => {
    const { clubId, officer, m1 } = await setup();
    const outsider = await actor();
    const photo = await uploadPhoto(officer);
    const { body } = await send('post', officer, `/clubs/${clubId}/activities`, { ...ACTIVITY, participantUserIds: [m1.id], photoFileIds: [photo] });

    const memberView = (await get(m1, `/activities/${body.id}`)).body;
    expect(memberView.participants.map((p: { userId: string }) => p.userId)).toEqual([m1.id]);
    expect(memberView.photos).toMatchObject([{ fileId: photo }]);
    expect(memberView.me.canManage).toBe(false);

    const publicView = (await get(outsider, `/activities/${body.id}`)).body;
    expect(publicView).toMatchObject({ title: ACTIVITY.title, participantTotal: 1, photoCount: 1 });
    expect(publicView).not.toHaveProperty('participants');
    expect(publicView).not.toHaveProperty('photos');

    // รูป: สมาชิกเปิดได้ (redirect) คนนอกไม่พบ
    expect((await get(m1, `/files/${photo}/view`)).status).toBe(302);
    expect((await get(outsider, `/files/${photo}/view`)).status).toBe(404);
  });

  it('แก้ไขแล้วเอารูปออก → รูปถูกลบจากที่เก็บ; ลบกิจกรรมแล้วไม่แสดงอีก', async () => {
    const { clubId, officer } = await setup();
    const [keep, drop] = [await uploadPhoto(officer), await uploadPhoto(officer)];
    const { body } = await send('post', officer, `/clubs/${clubId}/activities`, { ...ACTIVITY, photoFileIds: [keep, drop] });

    expect((await send('put', officer, `/activities/${body.id}`, { ...ACTIVITY, photoFileIds: [keep] })).status).toBe(204);
    const { rows } = await pool.query<{ object_key: string; deleted: boolean }>(
      'SELECT object_key, deleted_at IS NOT NULL AS deleted FROM files WHERE id = $1',
      [drop],
    );
    expect(rows[0]!.deleted).toBe(true);
    expect(await storage.headObject(rows[0]!.object_key)).toBeNull();

    expect((await send('delete', officer, `/activities/${body.id}`)).status).toBe(204);
    expect((await get(officer, `/activities/${body.id}`)).status).toBe(404);
    expect((await get(officer, `/clubs/${clubId}/activities`)).body.items).toEqual([]);
  });

  it('แนบรูปที่ผูกกับกิจกรรมอื่นอยู่แล้วไม่ได้', async () => {
    const { clubId, officer } = await setup();
    const photo = await uploadPhoto(officer);
    await send('post', officer, `/clubs/${clubId}/activities`, { ...ACTIVITY, photoFileIds: [photo] });
    const res = await send('post', officer, `/clubs/${clubId}/activities`, { ...ACTIVITY, photoFileIds: [photo] });
    expect(res.body.error.code).toBe('FILE_ALREADY_ATTACHED');
  });
});
