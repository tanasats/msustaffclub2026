import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addAdvisor, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(email?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  await grantRole(user.id, 'user');
  await grantRole(user.id, 'staff');
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const summary = async (who: Actor) => (await get(who, '/auth/me')).body.advisor;

// คำขอที่เสนอชื่อที่ปรึกษา (ตรงด้วย user_id หรือ email) ในสถานะที่กำหนด
async function nomination(applicant: Actor, advisor: { userId?: string; email: string }, appStatus: string, consent = 'pending') {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status)
     VALUES ('establish', 2570, $1, 'ชมรมทดสอบที่ปรึกษา', $2) RETURNING id`,
    [applicant.id, appStatus],
  );
  await pool.query(
    `INSERT INTO club_application_advisors (application_id, email, user_id, sort_order, consent_status, responded_at)
     VALUES ($1, $2, $3, 1, $4, CASE WHEN $4 = 'pending' THEN NULL ELSE now() END)`,
    [rows[0]!.id, advisor.email, advisor.userId ?? null, consent],
  );
  return rows[0]!.id;
}

async function submittedReport(clubId: string, by: string, month: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO club_monthly_reports (club_id, report_month, fiscal_year, status, activities_snapshot, created_by, submitted_by, submitted_at)
     VALUES ($1, $2::date, 2569, 'submitted', '[]'::jsonb, $3, $3, now()) RETURNING id`,
    [clubId, month, by],
  );
  return rows[0]!.id;
}

describe('งานที่ปรึกษาชมรม', () => {
  it('บุคลากรทั่วไป (ไม่ใช่ที่ปรึกษา): ตัวเลขเป็น 0 ทั้งหมด และกล่องงานว่าง', async () => {
    const staff = await actor();
    expect(await summary(staff)).toEqual({ pendingConsents: 0, activeClubs: 0, reportsToAcknowledge: 0 });
    expect((await get(staff, '/me/advisor-work')).body).toEqual({ requests: [], reports: [], clubs: [] });
  });

  it('คำขอรอยินยอม: นับเฉพาะคำขอ awaiting_consent ที่ยังไม่ตอบ (จับคู่ทั้ง user_id และ email ก่อนเคย login)', async () => {
    const applicant = await actor();
    const advisor = await actor('advisor.work@msu.ac.th');
    await nomination(applicant, { userId: advisor.id, email: advisor.email }, 'awaiting_consent');
    await nomination(applicant, { email: advisor.email }, 'awaiting_consent'); // เสนอด้วย email ก่อนผูก user
    await nomination(applicant, { userId: advisor.id, email: advisor.email }, 'awaiting_consent', 'accepted'); // ตอบแล้ว
    await nomination(applicant, { userId: advisor.id, email: advisor.email }, 'draft'); // ยังไม่ขอความยินยอม

    expect(await summary(advisor)).toMatchObject({ pendingConsents: 2, activeClubs: 0 });
    // คนอื่นไม่เห็นคำขอของที่ปรึกษาคนนี้
    expect(await summary(applicant)).toMatchObject({ pendingConsents: 0 });
    const work = (await get(advisor, '/me/advisor-work')).body;
    expect(work.requests).toHaveLength(3); // ร่างไม่แสดง
  });

  it('ที่ปรึกษาในวาระ: เห็นชมรมและรายงานรอรับทราบ; รับทราบแล้วหายจากกล่องงาน', async () => {
    const president = await actor();
    const advisor = await actor();
    const clubId = await createTestClub({ name: 'ชมรมดนตรีไทย' });
    await addAdvisor(clubId, advisor.id);
    const reportId = await submittedReport(clubId, president.id, '2026-08-01');

    expect(await summary(advisor)).toEqual({ pendingConsents: 0, activeClubs: 1, reportsToAcknowledge: 1 });
    const work = (await get(advisor, '/me/advisor-work')).body;
    expect(work.clubs).toMatchObject([{ id: clubId, nameTh: 'ชมรมดนตรีไทย', reportsToAcknowledge: 1 }]);
    expect(work.reports).toMatchObject([{ id: reportId, clubId, clubName: 'ชมรมดนตรีไทย', reportMonth: '2026-08-01' }]);

    const ack = await request(app)
      .post(`/monthly-reports/${reportId}/acknowledge`)
      .set('Cookie', advisor.cookie)
      .set('Origin', WEB_ORIGIN)
      .send({});
    expect(ack.status).toBe(204);
    expect(await summary(advisor)).toMatchObject({ activeClubs: 1, reportsToAcknowledge: 0 });
  });

  it('ไม่นับชมรมที่พ้นวาระที่ปรึกษาแล้ว หรือชมรมที่ไม่ active', async () => {
    const president = await actor();
    const advisor = await actor();
    const ended = await createTestClub({ name: 'ชมรมพ้นวาระ' });
    const suspended = await createTestClub({ name: 'ชมรมพักกิจการ', status: 'suspended' });
    await addAdvisor(ended, advisor.id);
    await pool.query('UPDATE club_advisors SET ended_on = CURRENT_DATE WHERE club_id = $1', [ended]);
    await addAdvisor(suspended, advisor.id);
    await submittedReport(ended, president.id, '2026-08-01');
    await submittedReport(suspended, president.id, '2026-08-01');

    expect(await summary(advisor)).toEqual({ pendingConsents: 0, activeClubs: 0, reportsToAcknowledge: 0 });
    expect((await get(advisor, '/me/advisor-work')).body).toMatchObject({ reports: [], clubs: [] });
  });

  it('ต้อง login', async () => {
    expect((await request(app).get('/me/advisor-work')).status).toBe(401);
  });
});
