import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { bangkokDateString, fiscalYearOf, fiscalYearRange } from '../src/services/fiscal-year.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(options: { email?: string; roles?: string[] } = {}): Promise<Actor> {
  const user = await createTestUser({ email: options.email });
  for (const role of options.roles ?? ['user', 'staff']) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2
     ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

function get(who: Actor, path: string) {
  return request(app).get(path).set('Cookie', who.cookie);
}

function post(who: Actor, path: string, body: object = {}) {
  return request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
}

function put(who: Actor, path: string, body: object) {
  return request(app).put(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
}

async function status(id: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>('SELECT status FROM club_applications WHERE id = $1', [id]);
  return rows[0]!.status;
}

interface Scenario {
  id: string;
  applicant: Actor;
  advisor1: Actor;
  advisor2: Actor;
  reviewer: Actor;
  approver: Actor;
  secretaryId: string;
  memberIds: string[];
}

/**
 * คำขอที่กรอกครบ: ประธาน + เลขาฯ + สมาชิก 3 คน (= 5), ที่ปรึกษา 2 คน
 * ที่ปรึกษาคนที่ 2 ถูกระบุด้วย email ก่อนเคย login
 */
async function scenario(): Promise<Scenario> {
  const applicant = await actor();
  const reviewer = await actor({ roles: ['user', 'staff', await roleWith('club_application:review')] });
  const approver = await actor({ roles: ['user', 'staff', await roleWith('club_application:approve')] });
  const advisor1 = await actor({ email: 'advisor.first@msu.ac.th' });
  const secretary = await createTestUser();
  const members = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);

  const created = await post(applicant, '/club-applications', { nameTh: 'ชมรมดนตรีไทย' });
  const id = created.body.id as string;
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM club_categories WHERE code = 'ethics_culture'");
  await request(app)
    .patch(`/club-applications/${id}`)
    .set('Cookie', applicant.cookie)
    .set('Origin', WEB_ORIGIN)
    .send({ categoryId: rows[0]!.id, objectives: ['ส่งเสริมดนตรีไทย'], motto: 'ดนตรีคือชีวิต' });
  await put(applicant, `/club-applications/${id}/advisors`, {
    advisors: [{ userId: advisor1.id }, { email: 'advisor.second@msu.ac.th' }],
  });
  await put(applicant, `/club-applications/${id}/committee`, {
    committee: [
      { userId: applicant.id, positionCode: 'president', contactPhone: '0800000001' },
      { userId: secretary.id, positionCode: 'secretary' },
    ],
  });
  await put(applicant, `/club-applications/${id}/members`, { memberUserIds: members.map((m) => m.id) });

  // ที่ปรึกษาคนที่ 2 login ครั้งแรกหลังจากถูกเสนอชื่อแล้ว
  const advisor2 = await actor({ email: 'advisor.second@msu.ac.th' });
  return {
    id,
    applicant,
    advisor1,
    advisor2,
    reviewer,
    approver,
    secretaryId: secretary.id,
    memberIds: members.map((m) => m.id),
  };
}

async function toSubmitted(s: Scenario) {
  expect((await post(s.applicant, `/club-applications/${s.id}/request-consent`)).status).toBe(204);
  expect((await post(s.advisor1, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' })).status).toBe(204);
  expect((await post(s.advisor2, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' })).status).toBe(204);
  expect((await post(s.applicant, `/club-applications/${s.id}/submit`)).status).toBe(204);
}

async function toReviewed(s: Scenario) {
  await toSubmitted(s);
  expect((await post(s.reviewer, `/club-applications/${s.id}/review`, { decision: 'pass' })).status).toBe(204);
}

describe('flow เต็ม: ขอความยินยอม → ยื่น → ตรวจ → อนุมัติ → สร้างชมรม', () => {
  it('อนุมัติแล้วได้ชมรม ที่ปรึกษา กรรมการ สมาชิก และ log ครบทุกขั้น', async () => {
    const s = await scenario();
    // ตราที่แนบกับคำขอ (ใส่ตรงในฐานข้อมูล — การอัปโหลดจริงทดสอบใน club-logo.test.ts)
    const { rows: logo } = await pool.query<{ id: string }>(
      `INSERT INTO files (bucket, object_key, original_name, mime_type, size_bytes, purpose, status, uploaded_at, uploaded_by)
       VALUES ('b', 'club-logos/x', 'logo.png', 'image/png', 10, 'club_logo', 'uploaded', now(), $1) RETURNING id`,
      [s.applicant.id],
    );
    await pool.query('UPDATE club_applications SET logo_file_id = $2 WHERE id = $1', [s.id, logo[0]!.id]);
    await toReviewed(s);

    const res = await post(s.approver, `/club-applications/${s.id}/decision`, { decision: 'approve', note: 'เห็นชอบ' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    const clubId = res.body.clubId as string;

    const { rows: clubs } = await pool.query(
      `SELECT name_th, status, motto, objectives, logo_file_id, to_char(established_on, 'YYYY-MM-DD') AS established_on,
              to_char(registered_until, 'YYYY-MM-DD') AS registered_until, regulation_text LIKE '%ชมรมดนตรีไทย%' AS has_regulation
         FROM clubs WHERE id = $1`,
      [clubId],
    );
    expect(clubs[0]).toEqual({
      name_th: 'ชมรมดนตรีไทย',
      status: 'active',
      motto: 'ดนตรีคือชีวิต',
      objectives: ['ส่งเสริมดนตรีไทย'],
      logo_file_id: logo[0]!.id,
      established_on: bangkokDateString(),
      registered_until: fiscalYearRange(fiscalYearOf()).end,
      has_regulation: true,
    });

    const { rows: advisors } = await pool.query('SELECT user_id, fiscal_year FROM club_advisors WHERE club_id = $1', [clubId]);
    expect(advisors.map((a) => a.user_id).sort()).toEqual([s.advisor1.id, s.advisor2.id].sort());
    expect(advisors[0].fiscal_year).toBe(fiscalYearOf());

    const { rows: committee } = await pool.query(
      `SELECT m.user_id, p.code, m.contact_phone FROM club_committee_members m
         JOIN club_positions p ON p.id = m.position_id WHERE m.club_id = $1 ORDER BY m.sort_order`,
      [clubId],
    );
    expect(committee).toEqual([
      { user_id: s.applicant.id, code: 'president', contact_phone: '0800000001' },
      { user_id: s.secretaryId, code: 'secretary', contact_phone: null },
    ]);

    const { rows: memberships } = await pool.query(
      "SELECT user_id FROM club_memberships WHERE club_id = $1 AND status = 'active'",
      [clubId],
    );
    expect(memberships.map((m) => m.user_id).sort()).toEqual([s.applicant.id, s.secretaryId, ...s.memberIds].sort());
    // สมาชิกตั้งต้นทุกคนมีประวัติ "อนุมัติโดยระบบ" (บันทึกในคำสั่งเดียวกับการสร้างสมาชิก)
    const { rows: memberEvents } = await pool.query(
      `SELECT e.action, e.actor_user_id FROM club_membership_events e
         JOIN club_memberships m ON m.id = e.membership_id WHERE m.club_id = $1`,
      [clubId],
    );
    expect(memberEvents).toHaveLength(memberships.length);
    expect(memberEvents.every((e) => e.action === 'approved' && e.actor_user_id === null)).toBe(true);
    // กรรมการชุดแรกมีประวัติ "รับตำแหน่ง" โดยระบบ
    const { rows: committeeEvents } = await pool.query(
      `SELECT e.action, e.actor_user_id FROM club_committee_events e
         JOIN club_committee_members m ON m.id = e.committee_member_id WHERE m.club_id = $1`,
      [clubId],
    );
    expect(committeeEvents).toEqual([
      { action: 'appointed', actor_user_id: null },
      { action: 'appointed', actor_user_id: null },
    ]);

    const detail = (await get(s.applicant, `/club-applications/${s.id}`)).body;
    expect(detail).toMatchObject({ status: 'approved', clubId, decisionNote: 'เห็นชอบ' });
    expect(detail.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'draft',
      'awaiting_consent',
      'submitted',
      'reviewed',
      'approved',
    ]);

    // ประธานได้สิทธิ์ระดับชมรมทันทีหลังอนุมัติ
    const { rows: access } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM club_committee_members WHERE club_id = $1 AND user_id = $2 AND ended_on IS NULL`,
      [clubId, s.applicant.id],
    );
    expect(access[0]!.n).toBe(1);
  });
});

describe('ขอความยินยอมจากที่ปรึกษา', () => {
  it('คำขอยังไม่ครบ → ขอความยินยอมไม่ได้ (422)', async () => {
    const applicant = await actor();
    const { body } = await post(applicant, '/club-applications', { nameTh: 'ชมรมว่าง' });
    const res = await post(applicant, `/club-applications/${body.id}/request-consent`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APPLICATION_INCOMPLETE');
  });

  it('ระหว่างรอความยินยอมแก้ไขไม่ได้ ต้องดึงกลับเป็นร่างก่อน', async () => {
    const s = await scenario();
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    const edit = await request(app)
      .patch(`/club-applications/${s.id}`)
      .set('Cookie', s.applicant.cookie)
      .set('Origin', WEB_ORIGIN)
      .send({ motto: 'ใหม่' });
    expect(edit.status).toBe(409);

    expect((await post(s.applicant, `/club-applications/${s.id}/withdraw`)).status).toBe(204);
    expect(await status(s.id)).toBe('draft');
  });

  it('ยื่นไม่ได้ถ้าที่ปรึกษายังยินยอมไม่ครบ', async () => {
    const s = await scenario();
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    await post(s.advisor1, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' });
    const res = await post(s.applicant, `/club-applications/${s.id}/submit`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ADVISOR_CONSENT_PENDING');
  });

  it('ที่ปรึกษาที่ถูกระบุด้วย email ตอบได้หลัง login และระบบผูก user ให้', async () => {
    const s = await scenario();
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    await post(s.advisor2, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' });
    const { rows } = await pool.query(
      "SELECT user_id, consent_status FROM club_application_advisors WHERE email = 'advisor.second@msu.ac.th'",
    );
    expect(rows).toEqual([{ user_id: s.advisor2.id, consent_status: 'accepted' }]);
  });

  it('ที่ปรึกษาปฏิเสธ → คำขอกลับเป็นร่าง พร้อมเหตุผลใน log', async () => {
    const s = await scenario();
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    await post(s.advisor1, `/club-applications/${s.id}/advisor-response`, { decision: 'decline', note: 'ไม่สะดวก' });
    expect(await status(s.id)).toBe('draft');
    const detail = (await get(s.applicant, `/club-applications/${s.id}`)).body;
    expect(detail.events.at(-1)).toMatchObject({ toStatus: 'draft', note: 'ที่ปรึกษาปฏิเสธ: ไม่สะดวก', actorUserId: s.advisor1.id });
  });

  it('ขอความยินยอมรอบใหม่ → ผลยินยอมเดิมถูกล้าง', async () => {
    const s = await scenario();
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    await post(s.advisor1, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' });
    await post(s.applicant, `/club-applications/${s.id}/withdraw`);
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    const { rows } = await pool.query("SELECT consent_status FROM club_application_advisors WHERE application_id = $1", [s.id]);
    expect(rows.map((r) => r.consent_status)).toEqual(['pending', 'pending']);
  });

  it('ผู้ที่ไม่ใช่ที่ปรึกษา หรือตอบซ้ำ → 409', async () => {
    const s = await scenario();
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    const stranger = await actor();
    expect((await post(stranger, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' })).status).toBe(409);
    await post(s.advisor1, `/club-applications/${s.id}/advisor-response`, { decision: 'accept' });
    expect((await post(s.advisor1, `/club-applications/${s.id}/advisor-response`, { decision: 'decline' })).status).toBe(409);
  });

  it('GET /club-applications/advisor-requests แสดงคำขอที่รอฉันยินยอม (ไม่รวมฉบับร่าง)', async () => {
    const s = await scenario();
    expect((await get(s.advisor2, '/club-applications/advisor-requests')).body.items).toEqual([]);
    await post(s.applicant, `/club-applications/${s.id}/request-consent`);
    const { items } = (await get(s.advisor2, '/club-applications/advisor-requests')).body;
    expect(items).toMatchObject([{ id: s.id, status: 'awaiting_consent', myConsentStatus: 'pending' }]);
  });
});

describe('ตรวจ (ขั้นที่ 1) และอนุมัติ (ขั้นที่ 2)', () => {
  it('ไม่มีสิทธิ์ → 403, ข้ามขั้น (อนุมัติก่อนตรวจ) → 409', async () => {
    const s = await scenario();
    await toSubmitted(s);
    expect((await post(s.approver, `/club-applications/${s.id}/review`, { decision: 'pass' })).status).toBe(403);
    expect((await post(s.reviewer, `/club-applications/${s.id}/decision`, { decision: 'approve' })).status).toBe(403);

    const superAdmin = await actor({ roles: ['user', 'super_admin'] });
    const skip = await post(superAdmin, `/club-applications/${s.id}/decision`, { decision: 'approve' });
    expect(skip.status).toBe(409);
  });

  it('ผู้ยื่นตรวจหรืออนุมัติคำขอของตัวเองไม่ได้ แม้มีสิทธิ์', async () => {
    const s = await scenario();
    await grantRole(s.applicant.id, await roleWith('club_application:review'));
    await toSubmitted(s);
    const res = await post(s.applicant, `/club-applications/${s.id}/review`, { decision: 'pass' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_DECIDE_OWN_APPLICATION');
  });

  it('เจ้าหน้าที่ส่งกลับแก้ไข (ต้องมีเหตุผล) → ผู้ยื่นแก้ได้ แล้วเริ่มขอความยินยอมใหม่', async () => {
    const s = await scenario();
    await toSubmitted(s);
    expect((await post(s.reviewer, `/club-applications/${s.id}/review`, { decision: 'return' })).status).toBe(422);
    expect(
      (await post(s.reviewer, `/club-applications/${s.id}/review`, { decision: 'return', note: 'แก้วัตถุประสงค์' })).status,
    ).toBe(204);
    expect(await status(s.id)).toBe('returned');

    const edit = await request(app)
      .patch(`/club-applications/${s.id}`)
      .set('Cookie', s.applicant.cookie)
      .set('Origin', WEB_ORIGIN)
      .send({ objectives: ['ส่งเสริมดนตรีไทย', 'อนุรักษ์วัฒนธรรม'] });
    expect(edit.status).toBe(204);
    expect((await post(s.applicant, `/club-applications/${s.id}/request-consent`)).status).toBe(204);
  });

  it('นายกสโมสรไม่อนุมัติ (ต้องมีเหตุผล) → ไม่สร้างชมรม', async () => {
    const s = await scenario();
    await toReviewed(s);
    expect((await post(s.approver, `/club-applications/${s.id}/decision`, { decision: 'reject' })).status).toBe(422);
    const res = await post(s.approver, `/club-applications/${s.id}/decision`, { decision: 'reject', note: 'ซ้ำซ้อน' });
    expect(res.body).toEqual({ status: 'rejected', clubId: null });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM clubs');
    expect(rows[0].n).toBe(0);
  });

  it('นายกสโมสรส่งกลับแก้ไข', async () => {
    const s = await scenario();
    await toReviewed(s);
    const res = await post(s.approver, `/club-applications/${s.id}/decision`, { decision: 'return', note: 'เพิ่มแผนกิจกรรม' });
    expect(res.body.status).toBe('returned');
    expect(await status(s.id)).toBe('returned');
  });

  it('ระหว่างรออนุมัติ มีชมรมชื่อซ้ำเกิดขึ้น → อนุมัติไม่ได้ และไม่มีข้อมูลค้าง (rollback ทั้งหมด)', async () => {
    const s = await scenario();
    await toReviewed(s);
    await pool.query(
      `INSERT INTO clubs (name_th, category_id, established_on, registered_until)
       SELECT 'ชมรมดนตรีไทย', id, DATE '2026-01-01', DATE '2026-09-30' FROM club_categories WHERE code = 'academic'`,
    );

    const res = await post(s.approver, `/club-applications/${s.id}/decision`, { decision: 'approve' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APPLICATION_INCOMPLETE');
    expect(await status(s.id)).toBe('reviewed');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM club_memberships');
    expect(rows[0].n).toBe(0);
  });

  it('กล่องงาน: ผู้ตรวจเห็นคำขอที่ยื่นแล้ว ผู้อนุมัติเห็นคำขอที่ตรวจผ่านแล้ว ผู้ใช้ทั่วไปดูไม่ได้', async () => {
    const s = await scenario();
    await toSubmitted(s);
    expect((await get(s.reviewer, '/club-applications/queue')).body.items.map((i: { id: string }) => i.id)).toEqual([s.id]);
    expect((await get(s.approver, '/club-applications/queue')).body.items).toEqual([]);

    await post(s.reviewer, `/club-applications/${s.id}/review`, { decision: 'pass' });
    expect((await get(s.approver, '/club-applications/queue')).body.items.map((i: { id: string }) => i.id)).toEqual([s.id]);
    expect((await get(s.applicant, '/club-applications/queue')).status).toBe(403);
    expect((await get(s.reviewer, '/club-applications/queue?status=bogus')).status).toBe(400);
  });

  it('ยื่นแล้วผู้ยื่นยกเลิกเองไม่ได้', async () => {
    const s = await scenario();
    await toSubmitted(s);
    const res = await post(s.applicant, `/club-applications/${s.id}/cancel`);
    expect(res.status).toBe(409);
  });
});
