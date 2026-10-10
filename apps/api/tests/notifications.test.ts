import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { notifyAdvisorsNominated, notifyApplicationResult } from '../src/services/notification-service.js';
import { ALL_NOTIFICATION_EVENTS } from '../src/services/notification-events.js';
import { NOTIFICATION_RETENTION_DAYS, purgeOldNotifications } from '../src/services/notifications-service.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(): Promise<Actor> {
  const user = await createTestUser();
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const send = (method: 'post' | 'patch', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);

async function setEmailEnabled(enabled: boolean) {
  const events = Object.fromEntries(ALL_NOTIFICATION_EVENTS.map((code) => [code, true]));
  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ('email.enabled', $1::jsonb), ('email.events', $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(enabled), JSON.stringify(events)],
  );
}

async function application(applicant: Actor): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status)
     VALUES ('establish', 2570, $1, 'ชมรมดนตรีไทย', 'awaiting_consent') RETURNING id`,
    [applicant.id],
  );
  return rows[0]!.id;
}

async function nominate(appId: string, order: number, email: string, userId: string | null) {
  await pool.query(
    'INSERT INTO club_application_advisors (application_id, email, user_id, sort_order) VALUES ($1, $2, $3, $4)',
    [appId, email, userId, order],
  );
}

async function outboxRecipients(): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>('SELECT recipient_email AS email FROM email_outbox ORDER BY recipient_email');
  return rows.map((r) => r.email);
}

async function notificationUsers(): Promise<string[]> {
  const { rows } = await pool.query<{ userId: string }>('SELECT user_id AS "userId" FROM notifications ORDER BY user_id');
  return rows.map((r) => r.userId);
}

describe('ค่าตั้งรับอีเมลแจ้งเตือน (/me/preferences)', () => {
  it('ค่าเริ่มต้น = รับ; ปิดรับแล้วขนาดตัวอักษรเดิมคงอยู่; เปิดกลับได้; ไม่ส่งค่าใดเลย → 400', async () => {
    const me = await actor();
    expect((await get(me, '/me/preferences')).body).toEqual({ fontScale: 'md', emailNotifications: true });
    await send('patch', me, '/me/preferences', { fontScale: 'lg' });

    const off = await send('patch', me, '/me/preferences', { emailNotifications: false });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ fontScale: 'lg', emailNotifications: false });
    expect((await get(me, '/auth/me')).body.preferences).toEqual({ fontScale: 'lg', emailNotifications: false });

    expect((await send('patch', me, '/me/preferences', { emailNotifications: true })).body).toEqual({ fontScale: 'lg', emailNotifications: true });
    expect((await send('patch', me, '/me/preferences', {})).status).toBe(400);
    expect((await send('patch', me, '/me/preferences', { emailNotifications: 'no' })).status).toBe(400);
  });

  it('ผู้ที่ไม่เคยตั้งค่าเลย ปิดรับอีเมลอย่างเดียวได้ (สร้างแถวพร้อมขนาดตัวอักษรค่าเริ่มต้น)', async () => {
    const me = await actor();
    expect((await send('patch', me, '/me/preferences', { emailNotifications: false })).body).toEqual({ fontScale: 'md', emailNotifications: false });
  });
});

describe('การแจ้งเตือน: อีเมลตามค่าตั้งของผู้รับ + ในระบบเสมอ', () => {
  it('ผู้ที่ปิดรับไม่ได้อีเมลแต่ยังได้การแจ้งเตือนในระบบ; ผู้ที่ไม่มีบัญชีได้อีเมลตามปกติ', async () => {
    await setEmailEnabled(true);
    const applicant = await actor();
    const optedIn = await actor();
    const optedOut = await actor();
    await send('patch', optedOut, '/me/preferences', { emailNotifications: false });
    const appId = await application(applicant);
    await nominate(appId, 1, optedIn.email, optedIn.id);
    await nominate(appId, 2, optedOut.email, optedOut.id);
    await nominate(appId, 3, 'never.logged@msu.ac.th', null);

    await notifyAdvisorsNominated(pool, appId, 'event-1');

    expect(await outboxRecipients()).toEqual([optedIn.email, 'never.logged@msu.ac.th'].sort());
    expect(await notificationUsers()).toEqual([optedIn.id, optedOut.id].sort());
    // เหตุการณ์เดิมซ้ำ → ไม่แจ้งซ้ำทั้งสองช่องทาง
    await notifyAdvisorsNominated(pool, appId, 'event-1');
    expect(await notificationUsers()).toHaveLength(2);
    expect(await outboxRecipients()).toHaveLength(2);
  });

  it('สวิตช์อีเมลของผู้ดูแลปิด → ไม่มีอีเมล แต่การแจ้งเตือนในระบบยังสร้าง พร้อมหัวเรื่อง เนื้อหา และลิงก์ภายในเว็บ', async () => {
    await setEmailEnabled(false);
    const applicant = await actor();
    const appId = await application(applicant);

    await notifyApplicationResult(pool, appId, 'returned', 'แก้ไขวัตถุประสงค์', 'event-2');

    expect(await outboxRecipients()).toEqual([]);
    const list = (await get(applicant, '/me/notifications')).body;
    expect(list.unread).toBe(1);
    expect(list.items[0]).toMatchObject({
      kind: 'application_result',
      title: 'คำขอจัดตั้งชมรมดนตรีไทย ถูกส่งกลับให้แก้ไข',
      linkPath: `/club-applications/${appId}`,
      readAt: null,
    });
    expect(list.items[0].body).toContain('เหตุผล/หมายเหตุ: แก้ไขวัตถุประสงค์');
  });
});

describe('/me/notifications', () => {
  async function seed(userId: string, count: number) {
    for (let i = 0; i < count; i++) {
      await pool.query(
        `INSERT INTO notifications (user_id, kind, dedupe_key, title, body, link_path) VALUES ($1, 'test', $2, $3, 'เนื้อหา', '/clubs')`,
        [userId, `${userId}:${i}`, `เรื่องที่ ${i}`],
      );
    }
  }

  it('เห็นเฉพาะของตัวเอง ใหม่สุดก่อน แบ่งหน้าได้; อ่าน 1 รายการ / อ่านทั้งหมด; ของคนอื่นตอบ 404', async () => {
    const me = await actor();
    const other = await actor();
    await seed(me.id, 3);
    await seed(other.id, 1);

    const page1 = (await get(me, '/me/notifications?pageSize=2')).body;
    expect(page1.total).toBe(3);
    expect(page1.unread).toBe(3);
    expect(page1.items.map((n: { title: string }) => n.title)).toEqual(['เรื่องที่ 2', 'เรื่องที่ 1']);
    expect((await get(me, '/me/notifications?pageSize=2&page=2')).body.items).toHaveLength(1);
    expect((await get(me, '/auth/me')).body.notifications).toEqual({ unread: 3 });

    expect((await send('post', me, `/me/notifications/${page1.items[0].id}/read`)).status).toBe(204);
    expect((await get(me, '/me/notifications')).body.unread).toBe(2);

    const othersId = (await get(other, '/me/notifications')).body.items[0].id;
    expect((await send('post', me, `/me/notifications/${othersId}/read`)).status).toBe(404);
    expect((await get(other, '/me/notifications')).body.unread).toBe(1);

    expect((await send('post', me, '/me/notifications/read-all')).status).toBe(204);
    expect((await get(me, '/auth/me')).body.notifications).toEqual({ unread: 0 });
    expect((await get(other, '/me/notifications')).body.unread).toBe(1);
  });

  it('ไม่ login → 401, ไม่มี Origin → 403, id ไม่ใช่ uuid → 400', async () => {
    const me = await actor();
    expect((await request(app).get('/me/notifications')).status).toBe(401);
    expect((await request(app).post('/me/notifications/read-all').set('Cookie', me.cookie)).status).toBe(403);
    expect((await send('post', me, '/me/notifications/abc/read')).status).toBe(400);
  });

  it(`ลบการแจ้งเตือนที่เก่ากว่า ${NOTIFICATION_RETENTION_DAYS} วัน และฐานข้อมูลรับเฉพาะลิงก์ภายในเว็บ`, async () => {
    const me = await actor();
    await seed(me.id, 2);
    await pool.query(
      `UPDATE notifications SET created_at = now() - make_interval(days => $1::int + 1) WHERE title = 'เรื่องที่ 0'`,
      [NOTIFICATION_RETENTION_DAYS],
    );
    expect(await purgeOldNotifications()).toBe(1);
    expect((await get(me, '/me/notifications')).body.items.map((n: { title: string }) => n.title)).toEqual(['เรื่องที่ 1']);

    await expect(
      pool.query(`INSERT INTO notifications (user_id, kind, dedupe_key, title, body, link_path) VALUES ($1, 'x', 'x', 'x', 'x', 'https://evil.example')`, [me.id]),
    ).rejects.toThrow(/notifications_link_path_internal/);
  });
});
