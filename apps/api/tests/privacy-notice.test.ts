import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { PRIVACY_NOTICE_VERSION } from '../src/services/privacy-service.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

async function actor() {
  const user = await createTestUser();
  await grantRole(user.id, 'user');
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const privacyOf = async (cookie: string) => (await request(app).get('/auth/me').set('Cookie', cookie)).body.privacy;
const acknowledge = (cookie: string, body: object) =>
  request(app).post('/me/privacy/acknowledge').set('Cookie', cookie).set('Origin', WEB_ORIGIN).send(body);

describe('ประกาศความเป็นส่วนตัว (PDPA มาตรา 23)', () => {
  it('เคยรับทราบเวอร์ชันเก่า → ต้องรับทราบเวอร์ชันปัจจุบันอีกครั้ง (หน้าเว็บแจ้งว่าประกาศมีการปรับปรุง)', async () => {
    const user = await actor();
    await pool.query("INSERT INTO privacy_notice_acknowledgements (user_id, notice_version) VALUES ($1, '0.9')", [user.id]);
    expect(await privacyOf(user.cookie)).toMatchObject({ acknowledged: false, acknowledgedEarlier: true });
  });

  it('ผู้ใช้ใหม่ยังไม่รับทราบ → รับทราบแล้วบันทึกเป็นหลักฐาน (กดซ้ำไม่เพิ่มแถว)', async () => {
    const user = await actor();
    expect(await privacyOf(user.cookie)).toEqual({ currentVersion: PRIVACY_NOTICE_VERSION, acknowledged: false, acknowledgedEarlier: false });

    expect((await acknowledge(user.cookie, { version: PRIVACY_NOTICE_VERSION })).status).toBe(204);
    expect((await acknowledge(user.cookie, { version: PRIVACY_NOTICE_VERSION })).status).toBe(204);
    expect(await privacyOf(user.cookie)).toEqual({ currentVersion: PRIVACY_NOTICE_VERSION, acknowledged: true, acknowledgedEarlier: false });

    const { rows } = await pool.query('SELECT user_id FROM privacy_notice_acknowledgements');
    expect(rows).toEqual([{ user_id: user.id }]);
  });

  it('รับทราบเวอร์ชันเก่า (หน้าเว็บค้าง) → 409; การรับทราบของคนอื่นไม่นับ; ต้อง login', async () => {
    const user = await actor();
    const other = await actor();
    expect((await acknowledge(user.cookie, { version: '0.9' })).body.error.code).toBe('PRIVACY_NOTICE_OUTDATED');
    await acknowledge(other.cookie, { version: PRIVACY_NOTICE_VERSION });
    expect((await privacyOf(user.cookie)).acknowledged).toBe(false);
    expect((await request(app).post('/me/privacy/acknowledge').set('Origin', WEB_ORIGIN).send({ version: PRIVACY_NOTICE_VERSION })).status).toBe(401);
  });

  it('บันทึกการรับทราบแก้ไข/ลบไม่ได้ (หลักฐาน)', async () => {
    const user = await actor();
    await acknowledge(user.cookie, { version: PRIVACY_NOTICE_VERSION });
    await expect(pool.query('DELETE FROM privacy_notice_acknowledgements')).rejects.toThrow();
    await expect(pool.query("UPDATE privacy_notice_acknowledgements SET notice_version = 'x'")).rejects.toThrow();
  });
});
