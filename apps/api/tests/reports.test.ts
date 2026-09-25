import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { bangkokDateString } from '../src/services/fiscal-year.js';
import { monthRange } from '../src/services/report-service.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
// เดือนปัจจุบัน (ชมรมทดสอบก่อตั้ง 2026-01-01)
const MONTH = bangkokDateString().slice(0, 7);
const { start: MONTH_START } = monthRange(MONTH);

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

const send = (method: 'post' | 'put', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

// ชมรมที่มีเลขานุการ (ส่งรายงานได้), เหรัญญิก (ส่งไม่ได้), ที่ปรึกษา (รับทราบได้), สมาชิกทั่วไป
async function setup() {
  const clubId = await createTestClub();
  const [secretary, treasurer, advisor, member] = [await actor(), await actor(), await actor(), await actor()];
  for (const [who, position] of [[secretary, 'secretary'], [treasurer, 'treasurer']] as const) {
    await addMembership(clubId, who.id, 'active');
    await addCommittee(clubId, who.id, position);
  }
  await addAdvisor(clubId, advisor.id);
  await addMembership(clubId, member.id, 'active');
  return { clubId, secretary, treasurer, advisor, member };
}

async function addActivity(clubId: string, recordedBy: string, title: string) {
  await pool.query(
    `INSERT INTO club_activities (club_id, held_on, title, participant_count, recorded_by) VALUES ($1, $2::date, $3, 12, $4)`,
    [clubId, MONTH_START, title, recordedBy],
  );
}

async function createReport(who: Actor, clubId: string) {
  const res = await send('post', who, `/clubs/${clubId}/monthly-reports`, { month: MONTH });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('จัดทำรายงานรายเดือน', () => {
  it('เลขานุการสร้างร่างได้ เดือนละ 1 ฉบับ ไม่ล่วงหน้า ไม่ก่อนวันก่อตั้ง; ตำแหน่งที่ไม่มีสิทธิ์ → 403', async () => {
    const { clubId, secretary, treasurer } = await setup();
    const path = `/clubs/${clubId}/monthly-reports`;
    await createReport(secretary, clubId);

    expect((await send('post', secretary, path, { month: MONTH })).body.error.code).toBe('REPORT_EXISTS');
    expect((await send('post', secretary, path, { month: '2099-01' })).body.error.code).toBe('MONTH_IN_FUTURE');
    expect((await send('post', secretary, path, { month: '2025-12' })).body.error.code).toBe('MONTH_BEFORE_ESTABLISHED');
    expect((await send('post', secretary, path, { month: '2026-13' })).status).toBe(400);
    expect((await send('post', treasurer, path, { month: '2026-02' })).status).toBe(403);
  });

  it('ร่างแสดงกิจกรรมของเดือนแบบปัจจุบัน ส่งแล้วเก็บภาพนิ่ง (กิจกรรมที่เพิ่มภายหลังไม่เปลี่ยนรายงาน)', async () => {
    const { clubId, secretary } = await setup();
    await addActivity(clubId, secretary.id, 'ซ้อมดนตรีครั้งที่ 1');
    const id = await createReport(secretary, clubId);

    const meetings = [{ metOn: MONTH_START, agenda: 'วางแผนงานวันสถาปนา', resolution: 'เห็นชอบ', attendeeCount: 7 }];
    expect((await send('put', secretary, `/monthly-reports/${id}`, { summary: 'สรุปเดือนนี้', meetings })).status).toBe(204);

    const draft = (await get(secretary, `/monthly-reports/${id}`)).body;
    expect(draft).toMatchObject({ status: 'draft', summary: 'สรุปเดือนนี้', me: { canEdit: true, canAcknowledge: false } });
    expect(draft.meetings).toMatchObject([{ agenda: 'วางแผนงานวันสถาปนา', attendeeCount: 7 }]);
    expect(draft.activities).toMatchObject([{ title: 'ซ้อมดนตรีครั้งที่ 1', participantTotal: 12 }]);

    expect((await send('post', secretary, `/monthly-reports/${id}/submit`)).status).toBe(204);
    await addActivity(clubId, secretary.id, 'กิจกรรมที่บันทึกหลังส่งรายงาน');

    const submitted = (await get(secretary, `/monthly-reports/${id}`)).body;
    expect(submitted.status).toBe('submitted');
    expect(submitted.activities.map((a: { title: string }) => a.title)).toEqual(['ซ้อมดนตรีครั้งที่ 1']);
    expect((await send('put', secretary, `/monthly-reports/${id}`, { summary: 'แก้' })).body.error.code).toBe('REPORT_NOT_EDITABLE');
  });

  it('วันที่ประชุมต้องอยู่ในเดือนของรายงาน (รายงานย้อนหลังเดือน ก.พ. 2569)', async () => {
    const { clubId, secretary } = await setup();
    const { body } = await send('post', secretary, `/clubs/${clubId}/monthly-reports`, { month: '2026-02' });
    const save = (metOn: string) => send('put', secretary, `/monthly-reports/${body.id}`, { meetings: [{ metOn, agenda: 'ประชุมกรรมการ' }] });
    expect((await save('2026-03-01')).body.error.code).toBe('MEETING_OUTSIDE_MONTH');
    expect((await save('2026-01-31')).body.error.code).toBe('MEETING_OUTSIDE_MONTH');
    expect((await save('2026-02-28')).status).toBe(204);
  });
  it('ภาพนิ่งเก็บเฉพาะกิจกรรมในเดือนของรายงาน (ไม่รวมเดือนก่อน/หลัง และที่ถูกลบ)', async () => {
    const { clubId, secretary } = await setup();
    for (const [heldOn, title, deleted] of [
      ['2026-01-31', 'ปลายเดือนก่อน', false],
      ['2026-02-01', 'ต้นเดือน', false],
      ['2026-02-28', 'สิ้นเดือน', false],
      ['2026-02-15', 'ถูกลบแล้ว', true],
      ['2026-03-01', 'ต้นเดือนถัดไป', false],
    ] as const) {
      await pool.query(
        `INSERT INTO club_activities (club_id, held_on, title, recorded_by, deleted_at)
         VALUES ($1, $2::date, $3, $4, CASE WHEN $5 THEN now() END)`,
        [clubId, heldOn, title, secretary.id, deleted],
      );
    }
    const { body } = await send('post', secretary, `/clubs/${clubId}/monthly-reports`, { month: '2026-02' });
    await send('post', secretary, `/monthly-reports/${body.id}/submit`);
    const { rows } = await pool.query<{ titles: string[] }>(
      "SELECT ARRAY(SELECT jsonb_array_elements(activities_snapshot) ->> 'title') AS titles FROM club_monthly_reports WHERE id = $1",
      [body.id],
    );
    expect(rows[0]!.titles).toEqual(['ต้นเดือน', 'สิ้นเดือน']);
  });
});

describe('ที่ปรึกษารับทราบ', () => {
  it('ที่ปรึกษาเห็นรายงานและรับทราบพร้อมหมายเหตุ; กรรมการรับทราบแทนไม่ได้; ร่างรับทราบไม่ได้', async () => {
    const { clubId, secretary, advisor } = await setup();
    const id = await createReport(secretary, clubId);

    expect((await send('post', advisor, `/monthly-reports/${id}/acknowledge`)).body.error.code).toBe('INVALID_STATUS');
    await send('post', secretary, `/monthly-reports/${id}/submit`);

    expect((await get(advisor, `/monthly-reports/${id}`)).body.me).toEqual({ canEdit: false, canAcknowledge: true });
    expect((await send('post', secretary, `/monthly-reports/${id}/acknowledge`)).status).toBe(403);
    expect((await send('post', advisor, `/monthly-reports/${id}/acknowledge`, { note: 'รับทราบ ขอบคุณครับ' })).status).toBe(204);

    const { rows } = await pool.query('SELECT status, acknowledged_by, acknowledgement_note FROM club_monthly_reports WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ status: 'acknowledged', acknowledged_by: advisor.id, acknowledgement_note: 'รับทราบ ขอบคุณครับ' });
    expect((await get(secretary, `/clubs/${clubId}/monthly-reports`)).body.items).toMatchObject([{ id, status: 'acknowledged' }]);
  });

  it('สมาชิกทั่วไปและคนนอกไม่เห็นรายงาน', async () => {
    const { clubId, secretary, member } = await setup();
    const outsider = await actor();
    const id = await createReport(secretary, clubId);
    for (const who of [member, outsider]) {
      expect((await get(who, `/monthly-reports/${id}`)).status).toBe(404);
      expect((await get(who, `/clubs/${clubId}/monthly-reports`)).status).toBe(403);
    }
  });
});
