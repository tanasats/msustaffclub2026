import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { buildRawMessage } from '../src/mail/mime.js';
import { OUTBOX_POLICY, processOutboxOnce } from '../src/mail/outbox-worker.js';
import type { MailTransport } from '../src/mail/transport.js';
import type { MailMessage } from '../src/mail/mime.js';
import {
  notifyAdvisorsNominated,
  notifyApplicationQueue,
  notifyApplicationResult,
  notifyMonthlyReportSubmitted,
} from '../src/services/notification-service.js';
import { ALL_NOTIFICATION_EVENTS } from '../src/services/notification-events.js';
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

async function actor(options: { email?: string; name?: string; roles?: string[] } = {}): Promise<Actor> {
  const user = await createTestUser({ email: options.email });
  if (options.name) await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, options.name]);
  for (const role of options.roles ?? ['user', 'staff']) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.code = $1 AND p.code = $2 ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

// เปิด/ปิดสวิตช์อีเมล (ค่าเริ่มต้นในโค้ด: ปิด)
async function setEmail(enabled: boolean, off: string[] = []) {
  const events = Object.fromEntries(ALL_NOTIFICATION_EVENTS.map((code) => [code, !off.includes(code)]));
  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ('email.enabled', $1::jsonb), ('email.events', $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(enabled), JSON.stringify(events)],
  );
}

async function outbox() {
  const { rows } = await pool.query<{ kind: string; recipient_email: string; status: string; subject: string; body_html: string; body_text: string }>(
    'SELECT kind, recipient_email, status, subject, body_html, body_text FROM email_outbox ORDER BY recipient_email',
  );
  return rows;
}

async function application(applicant: Actor, name = 'ชมรมดนตรีไทย'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status)
     VALUES ('establish', 2570, $1, $2, 'awaiting_consent') RETURNING id`,
    [applicant.id, name],
  );
  return rows[0]!.id;
}

async function nominate(appId: string, order: number, input: { email?: string; userId?: string; consent?: string; externalBy?: string }) {
  if (input.externalBy) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO external_persons (first_name_th, last_name_th, organization, phone, created_by)
       VALUES ('สมพงษ์', 'ดนตรีดี', 'วิทยาลัยนาฏศิลป', '0800000000', $1) RETURNING id`,
      [input.externalBy],
    );
    await pool.query('INSERT INTO club_application_advisors (application_id, external_person_id, sort_order) VALUES ($1, $2, $3)', [appId, rows[0]!.id, order]);
    return;
  }
  const consent = input.consent ?? 'pending';
  await pool.query(
    `INSERT INTO club_application_advisors (application_id, email, user_id, sort_order, consent_status, responded_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'pending' THEN NULL ELSE now() END)`,
    [appId, input.email, input.userId ?? null, order, consent],
  );
}

// transport ปลอม: เก็บอีเมลที่ "ส่ง" หรือโยน error ตามที่กำหนด
function fakeTransport(fail: string | null = null): MailTransport & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    kind: 'gmail',
    sent,
    async send(message) {
      if (fail) throw new Error(fail);
      sent.push(message);
    },
  };
}

describe('ใส่คิวอีเมลตามเหตุการณ์', () => {
  it('ค่าเริ่มต้นสวิตช์หลักปิด → ไม่ใส่คิว; ปิดเฉพาะเหตุการณ์ → ไม่ใส่คิวเหตุการณ์นั้น', async () => {
    const applicant = await actor({ name: 'ผู้ยื่น' });
    const appId = await application(applicant);
    await nominate(appId, 1, { email: 'advisor.a@msu.ac.th' });

    await notifyAdvisorsNominated(pool, appId, 'e1');
    expect(await outbox()).toEqual([]);

    await setEmail(true, ['advisor_nominated']);
    await notifyAdvisorsNominated(pool, appId, 'e2');
    expect(await outbox()).toEqual([]);

    await setEmail(true);
    await notifyAdvisorsNominated(pool, appId, 'e3');
    expect(await outbox()).toHaveLength(1);
  });

  it('ขอความยินยอม: ส่งถึงที่ปรึกษาบุคลากรที่ยังไม่ตอบ (ไม่รวมคนที่ตอบแล้ว/ภายนอก/บัญชีถูกระงับ) และไม่ซ้ำ', async () => {
    await setEmail(true);
    const applicant = await actor({ name: 'ธนัสถ์ สุดใจ' });
    const advisor = await actor({ email: 'advisor.a@msu.ac.th', name: 'ศิริพร ใจดี' });
    const disabled = await actor({ email: 'advisor.off@msu.ac.th' });
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [disabled.id]);
    const appId = await application(applicant);
    await nominate(appId, 1, { email: advisor.email, userId: advisor.id });
    await nominate(appId, 2, { email: 'not.yet.login@msu.ac.th' }); // ยังไม่เคย login → ส่งด้วย email

    await notifyAdvisorsNominated(pool, appId, 'event-1');
    await notifyAdvisorsNominated(pool, appId, 'event-1'); // เหตุการณ์เดิมซ้ำ → ไม่เพิ่ม
    const rows = await outbox();
    expect(rows.map((r) => r.recipient_email)).toEqual(['advisor.a@msu.ac.th', 'not.yet.login@msu.ac.th']);
    expect(rows[0]).toMatchObject({ kind: 'advisor_nominated', status: 'pending' });
    expect(rows[0]!.subject).toContain('ชมรมดนตรีไทย');
    expect(rows[0]!.body_text).toContain('เรียน คุณศิริพร ใจดี');
    expect(rows[0]!.body_text).toContain(`/club-applications/${appId}`);

    // ตอบแล้ว / บุคคลภายนอก / บัญชีถูกระงับ → ไม่ส่ง
    const other = await application(applicant, 'ชมรมอื่น');
    await nominate(other, 1, { email: advisor.email, userId: advisor.id, consent: 'accepted' });
    await nominate(other, 2, { externalBy: applicant.id });
    await notifyAdvisorsNominated(pool, other, 'event-2');
    const disabledApp = await application(applicant, 'ชมรมที่สาม');
    await nominate(disabledApp, 1, { email: disabled.email, userId: disabled.id });
    await notifyAdvisorsNominated(pool, disabledApp, 'event-3');
    expect(await outbox()).toHaveLength(2);
  });

  it('คิวงาน: ส่งถึงผู้ถือ role ที่มีสิทธิ์ตรวจ ไม่รวมผู้กระทำ, super_admin ที่ไม่ได้ถือ role นั้น และบัญชีที่ถูกระงับ', async () => {
    await setEmail(true);
    const reviewRole = await roleWith('club_application:review');
    const reviewer = await actor({ email: 'reviewer@msu.ac.th', roles: ['user', 'staff', reviewRole] });
    const inactive = await actor({ email: 'inactive.reviewer@msu.ac.th', roles: ['user', 'staff', reviewRole] });
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [inactive.id]);
    await actor({ email: 'admin@msu.ac.th', roles: ['user', 'staff', 'super_admin'] });
    const applicant = await actor({ roles: ['user', 'staff', reviewRole] }); // ผู้ยื่นมีสิทธิ์ตรวจด้วย → ไม่แจ้งตัวเอง
    const appId = await application(applicant);

    await notifyApplicationQueue(pool, appId, 'submitted', applicant.id, 'ev');
    expect((await outbox()).map((r) => r.recipient_email)).toEqual([reviewer.email]);
    expect((await outbox())[0]!.subject).toContain('รอตรวจ');
  });

  it('ผลการพิจารณา: ส่งถึงผู้ยื่นพร้อมเหตุผล และ escape HTML ในข้อความ', async () => {
    await setEmail(true);
    const applicant = await actor({ email: 'applicant@msu.ac.th', name: 'ผู้ยื่น' });
    const appId = await application(applicant);
    await notifyApplicationResult(pool, appId, 'returned', 'แก้ไขวัตถุประสงค์ <b>ข้อ 2</b>', 'ev');
    const [row] = await outbox();
    expect(row).toMatchObject({ kind: 'application_result', recipient_email: 'applicant@msu.ac.th' });
    expect(row!.subject).toContain('ส่งกลับให้แก้ไข');
    expect(row!.body_html).toContain('&lt;b&gt;ข้อ 2&lt;/b&gt;');
    expect(row!.body_html).not.toContain('<b>ข้อ 2</b>');
  });

  it('รายงานประจำเดือน: ส่งถึงที่ปรึกษาที่ยังอยู่ในวาระเท่านั้น', async () => {
    await setEmail(true);
    const president = await actor();
    const current = await actor({ email: 'current.advisor@msu.ac.th' });
    const ended = await actor({ email: 'ended.advisor@msu.ac.th' });
    const clubId = await createTestClub({ name: 'ชมรมวิ่ง' });
    await addAdvisor(clubId, current.id);
    await addAdvisor(clubId, ended.id);
    await pool.query('UPDATE club_advisors SET ended_on = CURRENT_DATE WHERE user_id = $1', [ended.id]);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO club_monthly_reports (club_id, report_month, fiscal_year, created_by) VALUES ($1, DATE '2026-08-01', 2569, $2) RETURNING id`,
      [clubId, president.id],
    );
    await notifyMonthlyReportSubmitted(pool, rows[0]!.id);
    const mails = await outbox();
    expect(mails.map((r) => r.recipient_email)).toEqual([current.email]);
    expect(mails[0]!.subject).toBe('ชมรมวิ่ง ส่งรายงานประจำเดือนสิงหาคม 2569');
  });
});

describe('worker ส่งอีเมลจากคิว', () => {
  async function queued(email = 'someone@msu.ac.th', createdAgo = '0 minutes') {
    await pool.query(
      `INSERT INTO email_outbox (kind, dedupe_key, recipient_email, subject, body_text, body_html, created_at)
       VALUES ('advisor_nominated', gen_random_uuid()::text, $1, 'หัวเรื่อง', 'ข้อความ', '<p>ข้อความ</p>', now() - $2::interval)`,
      [email, createdAgo],
    );
  }
  const statusOf = async () => (await pool.query<{ status: string; attempts: number; last_error: string | null }>('SELECT status, attempts, last_error FROM email_outbox')).rows;

  it('สวิตช์ปิด = หยุดส่ง (อีเมลยังรอ); เปิดแล้วส่งและบันทึกว่าส่งแล้ว', async () => {
    await queued();
    const transport = fakeTransport();
    expect(await processOutboxOnce(transport)).toMatchObject({ paused: true, sent: 0 });
    expect(await statusOf()).toMatchObject([{ status: 'pending', attempts: 0 }]);

    await setEmail(true);
    expect(await processOutboxOnce(transport)).toMatchObject({ paused: false, sent: 1 });
    expect(transport.sent).toMatchObject([{ to: 'someone@msu.ac.th', subject: 'หัวเรื่อง', text: 'ข้อความ' }]);
    expect(await statusOf()).toMatchObject([{ status: 'sent', attempts: 1 }]);
  });

  it('ส่งไม่สำเร็จ: ลองใหม่ตามระยะที่กำหนด แล้วเป็น failed เมื่อครบจำนวนครั้ง', async () => {
    await setEmail(true);
    await queued();
    const broken = fakeTransport('HTTP 401 invalid_grant');
    expect(await processOutboxOnce(broken)).toMatchObject({ retried: 1 });
    expect(await statusOf()).toMatchObject([{ status: 'pending', attempts: 1, last_error: 'HTTP 401 invalid_grant' }]);
    // ยังไม่ถึงเวลาลองใหม่ → ไม่หยิบ
    expect(await processOutboxOnce(broken)).toMatchObject({ retried: 0, failed: 0 });

    const maxAttempts = OUTBOX_POLICY.retryDelaysSeconds.length + 1;
    for (let i = 1; i < maxAttempts; i++) {
      await pool.query("UPDATE email_outbox SET next_attempt_at = now() - interval '1 second'");
      await processOutboxOnce(broken);
    }
    expect(await statusOf()).toMatchObject([{ status: 'failed', attempts: maxAttempts }]);
  });

  it('ยกเลิกอีเมลที่รอนานเกินกำหนด, คืนแถวที่ค้าง sending และลบประวัติเก่าเกินระยะเก็บ', async () => {
    await queued('stale@msu.ac.th', `${OUTBOX_POLICY.staleAfterHours + 1} hours`);
    await queued('stuck@msu.ac.th');
    await pool.query(
      `UPDATE email_outbox SET status = 'sending', attempts = 1, next_attempt_at = now() - interval '1 minute' WHERE recipient_email = 'stuck@msu.ac.th'`,
    );
    await queued('old@msu.ac.th', `${OUTBOX_POLICY.retentionDays + 1} days`);
    await pool.query(`UPDATE email_outbox SET status = 'sent', sent_at = created_at WHERE recipient_email = 'old@msu.ac.th'`);

    await setEmail(true);
    const transport = fakeTransport();
    const result = await processOutboxOnce(transport);
    expect(result).toMatchObject({ skipped: 1, sent: 1 });
    const { rows } = await pool.query<{ recipient_email: string; status: string }>('SELECT recipient_email, status FROM email_outbox ORDER BY recipient_email');
    expect(rows).toEqual([
      { recipient_email: 'stale@msu.ac.th', status: 'skipped' },
      { recipient_email: 'stuck@msu.ac.th', status: 'sent' },
    ]);
  });
});

describe('หน้าตั้งค่าอีเมล (system_setting:manage)', () => {
  it('เฉพาะ super_admin (permission ยังไม่ผูก role ใด) — บุคลากร/เจ้าหน้าที่สโมสร 403, ไม่ login 401', async () => {
    const staff = await actor();
    const officer = await actor({ roles: ['user', 'staff', 'club_officer'] });
    const admin = await actor({ roles: ['user', 'staff', 'super_admin'] });
    expect((await request(app).get('/admin/email-settings')).status).toBe(401);
    expect((await request(app).get('/admin/email-settings').set('Cookie', staff.cookie)).status).toBe(403);
    expect((await request(app).get('/admin/email-settings').set('Cookie', officer.cookie)).status).toBe(403);
    const res = await request(app).get('/admin/email-settings').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ transport: 'log', enabled: false, counts: { pending: 0, failed: 0, sent7d: 0 }, recent: [] });
    expect(res.body.events).toHaveLength(ALL_NOTIFICATION_EVENTS.length);
  });

  it('บันทึกสวิตช์หลักและรายเหตุการณ์ (ข้อมูลไม่ครบ/เกิน → 400) และส่งอีเมลทดสอบได้', async () => {
    const admin = await actor({ roles: ['user', 'staff', 'super_admin'], name: 'ผู้ดูแล' });
    const put = (body: object) => request(app).put('/admin/email-settings').set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).send(body);
    const events = Object.fromEntries(ALL_NOTIFICATION_EVENTS.map((code) => [code, code !== 'application_queue']));

    expect((await put({ enabled: true })).status).toBe(400);
    expect((await put({ enabled: true, events: { ...events, unknown_event: true } })).status).toBe(400);
    expect((await put({ enabled: true, events })).status).toBe(204);

    const res = await request(app).get('/admin/email-settings').set('Cookie', admin.cookie);
    expect(res.body.enabled).toBe(true);
    expect(res.body.updatedByName).toBe('ผู้ดูแล');
    expect(res.body.events.find((e: { code: string }) => e.code === 'application_queue')).toMatchObject({ enabled: false });

    const test = await request(app).post('/admin/email-settings/test').set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN);
    expect(test.status).toBe(200);
    expect(test.body).toEqual({ transport: 'log', delivered: false });
  });
});

describe('รูปแบบอีเมล (MIME)', () => {
  it('หัวเรื่องภาษาไทยเข้ารหัส UTF-8, มีทั้งข้อความล้วนและ HTML, และกันการแทรกหัวอีเมล', () => {
    const raw = buildRawMessage(
      { address: 'staff.club@msu.ac.th', name: 'สโมสรบุคลากร' },
      { to: 'a@msu.ac.th', subject: 'ทดสอบ', text: 'สวัสดี', html: '<p>สวัสดี</p>' },
    );
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain(`Subject: =?UTF-8?B?${Buffer.from('ทดสอบ').toString('base64')}?=`);
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
    expect(mime).toContain(Buffer.from('<p>สวัสดี</p>').toString('base64'));
    expect(() =>
      buildRawMessage({ address: 'staff.club@msu.ac.th', name: 'x' }, { to: 'a@msu.ac.th\r\nBcc: evil@example.com', subject: 's', text: 't', html: 'h' }),
    ).toThrow();
  });
});
