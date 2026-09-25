import { beforeEach, describe, expect, it } from 'vitest';
import { request } from './helpers/http.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';

beforeEach(resetDatabase);

describe('GET /auth/me', () => {
  it('ไม่มี cookie → 401', async () => {
    const res = await request(createApp()).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('session ถูกต้อง → ข้อมูลผู้ใช้ พร้อม role', async () => {
    const user = await createTestUser({ email: 'me@msu.ac.th' });
    await grantRole(user.id, 'user');
    const cookie = await createSessionCookie(user.id);

    const res = await request(createApp()).get('/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: user.id, email: 'me@msu.ac.th', name: 'ผู้ใช้ทดสอบ', pictureUrl: null },
      roles: ['user'],
      permissions: [],
      // บุคลากรที่ยังไม่มีข้อมูลจาก ERP-HR
      profile: { type: 'staff', staff: null },
      preferences: { fontScale: 'md' },
    });
  });

  it('session หมดอายุ → 401 และสั่งลบ cookie', async () => {
    const user = await createTestUser();
    const cookie = await createSessionCookie(user.id, { expired: true });

    const res = await request(createApp()).get('/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toContain(`${config.session.cookieName}=;`);
  });

  it('token ปลอม/ผิดรูปแบบ → 401', async () => {
    const res = await request(createApp()).get('/auth/me').set('Cookie', `${config.session.cookieName}=not-a-token`);
    expect(res.status).toBe(401);
  });

  it('ปิดใช้งานผู้ใช้แล้ว session เดิมใช้ไม่ได้ทันที', async () => {
    const user = await createTestUser();
    const cookie = await createSessionCookie(user.id);
    const app = createApp();
    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(200);

    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('เปลี่ยน role แล้วมีผลทันทีโดยไม่ต้อง login ใหม่', async () => {
    const user = await createTestUser();
    const cookie = await createSessionCookie(user.id);
    const app = createApp();

    await grantRole(user.id, 'super_admin');

    const res = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(res.body.roles).toEqual(['super_admin']);
  });
});

describe('POST /auth/logout', () => {
  it('ลบ session ในฐานข้อมูลและลบ cookie', async () => {
    const user = await createTestUser();
    const cookie = await createSessionCookie(user.id);
    const app = createApp();

    const res = await request(app).post('/auth/logout').set('Origin', WEB_ORIGIN).set('Cookie', cookie);

    expect(res.status).toBe(204);
    const { rows } = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions');
    expect(rows[0]?.count).toBe(0);
    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('ไม่มี session ก็ตอบ 204', async () => {
    const res = await request(createApp()).post('/auth/logout').set('Origin', WEB_ORIGIN);
    expect(res.status).toBe(204);
  });
});

describe('CSRF (ตรวจ header Origin)', () => {
  it('POST ที่ไม่มี Origin → 403 และไม่ลบ session', async () => {
    const user = await createTestUser();
    const cookie = await createSessionCookie(user.id);

    const res = await request(createApp()).post('/auth/logout').set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_ORIGIN');
    const { rows } = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions');
    expect(rows[0]?.count).toBe(1);
  });

  it('POST จาก Origin อื่น → 403', async () => {
    const res = await request(createApp()).post('/auth/logout').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });

  it('GET ไม่ต้องมี Origin', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
  });
});
