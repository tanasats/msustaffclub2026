import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { bangkokDateString, fiscalYearOf } from '../src/services/fiscal-year.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const FY = fiscalYearOf();
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

const send = (method: 'post' | 'put', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

// ชมรม (ก่อตั้ง 2026-01-01) ที่มีเลขานุการ เหรัญญิก ที่ปรึกษา สมาชิก + เจ้าหน้าที่สโมสร (role club_officer)
async function setup() {
  const clubId = await createTestClub();
  const [secretary, treasurer, advisor, member] = [await actor(), await actor(), await actor(), await actor()];
  for (const [who, position] of [[secretary, 'secretary'], [treasurer, 'treasurer']] as const) {
    await addMembership(clubId, who.id, 'active');
    await addCommittee(clubId, who.id, position);
  }
  await addAdvisor(clubId, advisor.id);
  await addMembership(clubId, member.id, 'active');
  const officer = await actor(['user', 'staff', 'club_officer']);
  return { clubId, secretary, treasurer, advisor, member, officer };
}

async function createAnnual(who: Actor, clubId: string) {
  const res = await send('post', who, `/clubs/${clubId}/annual-reports`, { fiscalYear: FY });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('รายงานประจำปี', () => {
  it('เลขานุการสร้างร่างได้ ปีละ 1 ฉบับ เฉพาะปีนี้/ปีที่แล้ว; เหรัญญิก → 403', async () => {
    const { clubId, secretary, treasurer } = await setup();
    await createAnnual(secretary, clubId);
    const path = `/clubs/${clubId}/annual-reports`;
    expect((await send('post', secretary, path, { fiscalYear: FY })).body.error.code).toBe('REPORT_EXISTS');
    expect((await send('post', secretary, path, { fiscalYear: FY + 1 })).body.error.code).toBe('FISCAL_YEAR_OUT_OF_RANGE');
    expect((await send('post', treasurer, path, { fiscalYear: FY - 1 })).status).toBe(403);
  });

  it('ร่างคำนวณสถิติจากข้อมูลปัจจุบัน; ต้องมีสรุปก่อนส่ง; ส่งแล้วเก็บภาพนิ่ง', async () => {
    const { clubId, secretary, member } = await setup();
    // กิจกรรม: กรอกจำนวน 12 คน + เลือกรายชื่อ 2 คน = ผู้เข้าร่วมรวม 14
    await pool.query(
      `INSERT INTO club_activities (club_id, held_on, title, participant_count, recorded_by) VALUES ($1, $2::date, 'กิจกรรม ก', 12, $3)`,
      [clubId, TODAY, secretary.id],
    );
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO club_activities (club_id, held_on, title, recorded_by) VALUES ($1, $2::date, 'กิจกรรม ข', $3) RETURNING id`,
      [clubId, TODAY, secretary.id],
    );
    await pool.query('INSERT INTO club_activity_participants (activity_id, user_id) VALUES ($1, $2), ($1, $3)', [rows[0]!.id, secretary.id, member.id]);
    await pool.query(
      `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, status, decided_by, decided_at)
       VALUES ($1, $2, 'รางวัล', $3::date, 'national', 'competition', 'approved', $2, now())`,
      [clubId, member.id, TODAY],
    );
    const id = await createAnnual(secretary, clubId);

    const draft = (await get(secretary, `/annual-reports/${id}`)).body;
    expect(draft.stats).toEqual({
      activityCount: 2,
      participantTotal: 14,
      plannedCount: 0,
      activeMembers: 3,
      approvedAchievements: 1,
      monthlyReportsSubmitted: 0,
    });
    expect(draft.dueDate).toBe(`${Number(FY) - 543}-08-31`);
    expect(draft.me).toEqual({ canEdit: true, canAcknowledge: false, canViewClubReports: true });

    expect((await send('post', secretary, `/annual-reports/${id}/submit`)).body.error.code).toBe('SUMMARY_REQUIRED');
    await send('put', secretary, `/annual-reports/${id}`, { summary: 'จัดกิจกรรมครบตามแผน', obstacles: 'งบประมาณจำกัด' });
    expect((await send('post', secretary, `/annual-reports/${id}/submit`)).status).toBe(204);

    await pool.query(`INSERT INTO club_activities (club_id, held_on, title, recorded_by) VALUES ($1, $2::date, 'หลังส่ง', $3)`, [clubId, TODAY, secretary.id]);
    const submitted = (await get(secretary, `/annual-reports/${id}`)).body;
    expect(submitted).toMatchObject({ status: 'submitted', summary: 'จัดกิจกรรมครบตามแผน', obstacles: 'งบประมาณจำกัด' });
    expect(submitted.stats.activityCount).toBe(2);
    expect(submitted.activities.map((a: { title: string }) => a.title).sort()).toEqual(['กิจกรรม ก', 'กิจกรรม ข']);
    expect((await send('put', secretary, `/annual-reports/${id}`, { summary: 'แก้' })).body.error.code).toBe('REPORT_NOT_EDITABLE');
  });

  it('เจ้าหน้าที่สโมสร (club_report:review) ดูได้และรับทราบ; ที่ปรึกษา/กรรมการรับทราบไม่ได้; สมาชิกไม่เห็น', async () => {
    const { clubId, secretary, advisor, member, officer } = await setup();
    const id = await createAnnual(secretary, clubId);
    await send('put', secretary, `/annual-reports/${id}`, { summary: 'สรุป' });
    await send('post', secretary, `/annual-reports/${id}/submit`);

    expect((await get(member, `/annual-reports/${id}`)).status).toBe(404);
    expect((await get(advisor, `/annual-reports/${id}`)).body.me.canAcknowledge).toBe(false);
    for (const who of [secretary, advisor]) {
      expect((await send('post', who, `/annual-reports/${id}/acknowledge`)).status).toBe(403);
    }
    expect((await get(officer, `/annual-reports/${id}`)).body.me).toEqual({ canEdit: false, canAcknowledge: true, canViewClubReports: false });
    expect((await send('post', officer, `/annual-reports/${id}/acknowledge`, { note: 'รับทราบ' })).status).toBe(204);
    const { rows } = await pool.query('SELECT status, acknowledged_by FROM club_annual_reports WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ status: 'acknowledged', acknowledged_by: officer.id });
  });
});

describe('ภาพรวมการส่งรายงาน', () => {
  it('เฉพาะผู้มี club_report:review; แสดงเดือนที่ครบกำหนดแต่ยังไม่ส่ง และสถานะรายงานประจำปี', async () => {
    const { clubId, secretary, officer } = await setup();
    // ส่งรายงานเดือน ก.พ. 2569 แล้ว, ร่างเดือน มี.ค. (ร่างยังถือว่าไม่ส่ง)
    const feb = await send('post', secretary, `/clubs/${clubId}/monthly-reports`, { month: '2026-02' });
    await send('post', secretary, `/monthly-reports/${feb.body.id}/submit`);
    await send('post', secretary, `/clubs/${clubId}/monthly-reports`, { month: '2026-03' });
    await createAnnual(secretary, clubId);

    expect((await get(secretary, '/reports/overview')).status).toBe(403);
    const res = await get(officer, `/reports/overview?fiscalYear=${FY}`);
    expect(res.status).toBe(200);
    const row = res.body.items.find((r: { clubId: string }) => r.clubId === clubId);
    expect(row).toMatchObject({ awaitingAdvisor: 1, annualStatus: 'draft' });
    expect(row.missingMonths).toContain('2026-01');
    expect(row.missingMonths).toContain('2026-03');
    expect(row.missingMonths).not.toContain('2026-02');
    // เดือนปัจจุบันยังไม่ครบกำหนด และไม่นับเดือนก่อนก่อตั้ง
    expect(row.missingMonths).not.toContain(TODAY.slice(0, 7));
    expect(row.missingMonths).not.toContain('2025-12');
  });
});
