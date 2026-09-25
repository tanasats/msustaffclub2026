import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

async function login() {
  const user = await createTestUser();
  return { ...user, cookie: await createSessionCookie(user.id) };
}

function patch(cookie: string, body: object) {
  return request(app).patch('/me/preferences').set('Cookie', cookie).set('Origin', WEB_ORIGIN).send(body);
}

describe('/me/preferences (ขนาดตัวอักษร)', () => {
  it('ยังไม่เคยตั้งค่า → ค่าเริ่มต้น md (ไม่สร้างแถว)', async () => {
    const me = await login();
    const res = await request(app).get('/me/preferences').set('Cookie', me.cookie);
    expect(res.body).toEqual({ fontScale: 'md' });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM user_preferences');
    expect(rows[0].n).toBe(0);
  });

  it('ตั้งค่าแล้วจำไว้ในฐานข้อมูล: ใช้ได้กับ session ใหม่ (เข้าระบบครั้งถัดไป/อุปกรณ์อื่น) และแสดงใน /auth/me', async () => {
    const me = await login();
    const res = await patch(me.cookie, { fontScale: 'xl' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fontScale: 'xl' });

    const anotherDevice = await createSessionCookie(me.id);
    expect((await request(app).get('/me/preferences').set('Cookie', anotherDevice)).body).toEqual({ fontScale: 'xl' });
    expect((await request(app).get('/auth/me').set('Cookie', anotherDevice)).body.preferences).toEqual({ fontScale: 'xl' });

    await patch(me.cookie, { fontScale: 'sm' });
    expect((await request(app).get('/me/preferences').set('Cookie', me.cookie)).body).toEqual({ fontScale: 'sm' });
  });

  it('ค่าของแต่ละคนแยกกัน', async () => {
    const a = await login();
    const b = await login();
    await patch(a.cookie, { fontScale: 'lg' });
    expect((await request(app).get('/me/preferences').set('Cookie', b.cookie)).body).toEqual({ fontScale: 'md' });
  });

  it('ค่าที่ไม่รู้จัก / ฟิลด์เกิน → 400, ไม่ login → 401, ไม่มี Origin → 403', async () => {
    const me = await login();
    expect((await patch(me.cookie, { fontScale: 'huge' })).status).toBe(400);
    expect((await patch(me.cookie, { fontScale: 'lg', userId: 'x' })).status).toBe(400);
    expect((await request(app).get('/me/preferences')).status).toBe(401);
    const noOrigin = await request(app).patch('/me/preferences').set('Cookie', me.cookie).send({ fontScale: 'lg' });
    expect(noOrigin.status).toBe(403);
  });

  it('ฐานข้อมูลปฏิเสธค่านอกรายการ (CHECK constraint)', async () => {
    const me = await login();
    await expect(
      pool.query("INSERT INTO user_preferences (user_id, font_scale) VALUES ($1, 'xxl')", [me.id]),
    ).rejects.toThrow(/user_preferences_font_scale_check/);
  });
});
