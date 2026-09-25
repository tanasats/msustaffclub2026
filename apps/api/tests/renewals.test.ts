import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { fiscalYearsServed, renewalWindow } from '../src/services/renewal-service.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);
afterEach(() => {
  vi.useRealTimers();
});

const app = createApp();

// ตั้ง "วันนี้" ของแอป (เฉพาะ Date ไม่แตะ timer อื่น เพื่อให้ pg/supertest ทำงานปกติ)
function today(date: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${date}T10:00:00+07:00`));
}

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff'], email?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  for (const role of roles) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2 ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

const send = (method: 'post' | 'put' | 'patch', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

/**
 * ชมรม (ทะเบียนหมดอายุ 30 ก.ย. 2569 = ปีงบประมาณ 2569) ประธาน + เลขาฯ + เหรัญญิก + สมาชิก 3 คน (รวม 6)
 * ที่ปรึกษา 1 คน; ต่อทะเบียน = ปีงบประมาณ 2570
 */
async function setup() {
  const clubId = await createTestClub({ name: 'ชมรมดนตรีไทย' });
  await pool.query(
    `UPDATE clubs SET motto = 'ดนตรีคือชีวิต', regulation_text = 'ระเบียบเดิม', objectives = ARRAY['ส่งเสริมดนตรีไทย'] WHERE id = $1`,
    [clubId],
  );
  const [president, secretary, treasurer] = [await actor(), await actor(), await actor()];
  for (const [who, position] of [[president, 'president'], [secretary, 'secretary'], [treasurer, 'treasurer']] as const) {
    await addMembership(clubId, who.id, 'active');
    await addCommittee(clubId, who.id, position);
  }
  for (let i = 0; i < 3; i++) await addMembership(clubId, (await createTestUser()).id, 'active');
  const advisor = await actor(['user', 'staff'], 'advisor.renew@msu.ac.th');
  await addAdvisor(clubId, advisor.id);
  return { clubId, president, secretary, treasurer, advisor };
}

async function submitAnnualReport(clubId: string, userId: string, fiscalYear = 2569) {
  await pool.query(
    `INSERT INTO club_annual_reports (club_id, fiscal_year, status, summary, stats_snapshot, activities_snapshot, created_by, submitted_by, submitted_at)
     VALUES ($1, $2, 'submitted', 'สรุป', '{}'::jsonb, '[]'::jsonb, $3, $3, now())`,
    [clubId, fiscalYear, userId],
  );
}

describe('ช่วงเวลาและเงื่อนไขการยื่น', () => {
  it('ช่วงยื่น = 1 ก.ค. ถึงวันหมดอายุทะเบียน และนับปีงบประมาณที่ดำรงตำแหน่งถูกต้อง', () => {
    expect(renewalWindow('2026-09-30')).toEqual({ targetFiscalYear: 2570, opensOn: '2026-07-01', closesOn: '2026-09-30' });
    expect(fiscalYearsServed('2022-10-01', '2026-09-30')).toBe(4);
    expect(fiscalYearsServed('2022-09-30', '2026-09-30')).toBe(5);
    expect(fiscalYearsServed('2026-01-01', '2026-09-30')).toBe(1);
  });

  it('ก่อน 1 ก.ค. และหลังหมดอายุ ยื่นไม่ได้ (หลังหมดอายุแสดงว่าหมดอายุ)', async () => {
    const { clubId, secretary } = await setup();
    today('2026-06-30');
    expect((await send('post', secretary, `/clubs/${clubId}/renewals`)).body.error.code).toBe('RENEWAL_NOT_OPEN');
    expect((await get(secretary, `/clubs/${clubId}/renewal`)).body).toMatchObject({ isOpen: false, expired: false, canApply: false });

    today('2026-10-01');
    expect((await send('post', secretary, `/clubs/${clubId}/renewals`)).body.error.code).toBe('RENEWAL_NOT_OPEN');
    expect((await get(secretary, `/clubs/${clubId}/renewal`)).body).toMatchObject({ isOpen: false, expired: true });
  });

  it('เลขานุการยื่นได้ในช่วงเวลา → คัดลอกข้อมูลชมรมและที่ปรึกษาชุดปัจจุบัน; ยื่นซ้ำไม่ได้; เหรัญญิก → 403', async () => {
    const { clubId, secretary, treasurer, advisor } = await setup();
    today('2026-08-15');
    expect((await get(secretary, `/clubs/${clubId}/renewal`)).body).toMatchObject({ isOpen: true, canApply: true, application: null });

    const res = await send('post', secretary, `/clubs/${clubId}/renewals`);
    expect(res.status).toBe(201);
    const detail = (await get(secretary, `/club-applications/${res.body.id}`)).body;
    expect(detail).toMatchObject({ type: 'renewal', status: 'draft', fiscalYear: 2570, clubId, nameTh: 'ชมรมดนตรีไทย', motto: 'ดนตรีคือชีวิต' });
    expect(detail.advisors).toMatchObject([{ email: 'advisor.renew@msu.ac.th', consentStatus: 'pending' }]);
    expect(detail.renewal).toMatchObject({ activeMemberCount: 6, previousAnnualReport: null });
    expect(advisor.email).toBe('advisor.renew@msu.ac.th');

    expect((await send('post', secretary, `/clubs/${clubId}/renewals`)).body.error.code).toBe('RENEWAL_EXISTS');
    expect((await get(secretary, `/clubs/${clubId}/renewal`)).body).toMatchObject({ application: { id: res.body.id }, canApply: false });
    expect((await send('post', treasurer, `/clubs/${clubId}/renewals`)).status).toBe(403);
  });

  it('ตรวจก่อนยื่น: ต้องส่งรายงานประจำปีที่แล้ว และสมาชิก ≥ 5; แก้กรรมการ/สมาชิกในคำขอไม่ได้', async () => {
    const { clubId, secretary } = await setup();
    today('2026-08-15');
    const { body } = await send('post', secretary, `/clubs/${clubId}/renewals`);
    await pool.query("UPDATE club_memberships SET status = 'ended', ended_on = '2026-08-01', end_reason = 'resigned' WHERE id IN (SELECT id FROM club_memberships WHERE club_id = $1 AND user_id NOT IN (SELECT user_id FROM club_committee_members WHERE club_id = $1) LIMIT 2)", [clubId]);

    const issues = (await get(secretary, `/club-applications/${body.id}/validation`)).body.issues.map((i: { code: string }) => i.code);
    expect(issues).toContain('ANNUAL_REPORT_REQUIRED');
    expect(issues).toContain('MIN_MEMBERS');
    expect(issues).not.toContain('APPLICANT_MUST_BE_PRESIDENT');

    const committee = [{ userId: secretary.id, positionCode: 'president' }];
    expect((await send('put', secretary, `/club-applications/${body.id}/committee`, { committee })).body.error.code).toBe('NOT_APPLICABLE_FOR_RENEWAL');
    expect((await send('put', secretary, `/club-applications/${body.id}/members`, { memberUserIds: [] })).body.error.code).toBe('NOT_APPLICABLE_FOR_RENEWAL');
  });

  it('เตือนกรรมการที่ดำรงตำแหน่งครบ 4 ปีงบประมาณ', async () => {
    const { clubId, secretary, president } = await setup();
    await pool.query(`UPDATE club_committee_members SET started_on = '2022-11-01' WHERE club_id = $1 AND user_id = $2`, [clubId, president.id]);
    today('2026-08-15');
    const { body } = await send('post', secretary, `/clubs/${clubId}/renewals`);
    const committee = (await get(secretary, `/club-applications/${body.id}`)).body.renewal.committee;
    const byUser = new Map(committee.map((c: { userId: string }) => [c.userId, c]));
    expect(byUser.get(president.id)).toMatchObject({ fiscalYearsServed: 4, termWarning: true });
    expect(byUser.get(secretary.id)).toMatchObject({ termWarning: false });
  });
});

describe('อนุมัติต่อทะเบียน', () => {
  it('flow เต็ม → ขยายทะเบียน ปรับระเบียบ เปลี่ยนที่ปรึกษาเป็นชุดใหม่ เพิ่มแผนปีใหม่ กรรมการ/สมาชิกไม่เปลี่ยน', async () => {
    const { clubId, secretary, advisor } = await setup();
    const reviewer = await actor(['user', 'staff', await roleWith('club_application:review')]);
    const approver = await actor(['user', 'staff', await roleWith('club_application:approve')]);
    await submitAnnualReport(clubId, secretary.id);
    today('2026-08-15');

    const { body } = await send('post', secretary, `/clubs/${clubId}/renewals`);
    const base = `/club-applications/${body.id}`;
    expect((await send('patch', secretary, base, { regulationText: 'ระเบียบฉบับปรับปรุง 2570' })).status).toBe(204);
    expect((await send('put', secretary, `${base}/activities`, { activities: [{ title: 'แสดงดนตรีงานวันสถาปนา' }] })).status).toBe(204);
    expect((await get(secretary, `${base}/validation`)).body.issues).toEqual([]);

    expect((await send('post', secretary, `${base}/request-consent`)).status).toBe(204);
    expect((await send('post', advisor, `${base}/advisor-response`, { decision: 'accept' })).status).toBe(204);
    expect((await send('post', secretary, `${base}/submit`)).status).toBe(204);
    expect((await send('post', reviewer, `${base}/review`, { decision: 'pass' })).status).toBe(204);
    const decided = await send('post', approver, `${base}/decision`, { decision: 'approve' });
    expect(decided.status).toBe(200);
    expect(decided.body).toEqual({ status: 'approved', clubId });

    const { rows: club } = await pool.query(
      `SELECT to_char(registered_until, 'YYYY-MM-DD') AS registered_until, regulation_text,
              (SELECT count(*)::int FROM club_memberships WHERE club_id = c.id AND status = 'active') AS members,
              (SELECT count(*)::int FROM club_committee_members WHERE club_id = c.id AND ended_on IS NULL) AS committee
         FROM clubs c WHERE id = $1`,
      [clubId],
    );
    expect(club[0]).toEqual({ registered_until: '2027-09-30', regulation_text: 'ระเบียบฉบับปรับปรุง 2570', members: 6, committee: 3 });

    const { rows: advisors } = await pool.query(
      `SELECT user_id, fiscal_year, ended_on IS NOT NULL AS ended FROM club_advisors WHERE club_id = $1 ORDER BY created_at`,
      [clubId],
    );
    expect(advisors).toEqual([
      { user_id: advisor.id, fiscal_year: 2569, ended: true },
      { user_id: advisor.id, fiscal_year: 2570, ended: false },
    ]);
    const { rows: plans } = await pool.query('SELECT title, fiscal_year FROM club_planned_activities WHERE club_id = $1', [clubId]);
    expect(plans).toEqual([{ title: 'แสดงดนตรีงานวันสถาปนา', fiscal_year: 2570 }]);
  });
});
