import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { FIRST_LOGIN_REASON } from '../src/services/auth-service.js';
import { googleOAuth } from '../src/services/google-oauth-client.js';
import { hashToken } from '../src/services/session-token.js';
import { resetDatabase } from './helpers/db.js';
import { loginWithGoogle, pickCookie, sessionCookieOf } from './helpers/auth.js';

beforeEach(resetDatabase);
afterEach(() => {
  vi.restoreAllMocks();
});

const loginErrorUrl = (code: string) => `${config.webUrl.replace(/\/$/, '')}/login?error=${code}`;

async function countRows(table: 'users' | 'sessions' | 'user_roles' | 'role_change_logs'): Promise<number> {
  // ชื่อตารางมาจาก union type ที่กำหนดตายตัวด้านบน ไม่ได้มาจาก input
  const { rows } = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0]?.count ?? 0;
}

describe('GET /auth/google', () => {
  it('redirect ไป Google พร้อม state, nonce, PKCE (S256) และเก็บค่าไว้ใน cookie httpOnly', async () => {
    const res = await request(createApp()).get('/auth/google');

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('nonce')).toBeTruthy();
    expect(location.searchParams.get('hd')).toBe('msu.ac.th');

    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toContain(`${config.session.cookieName}_oauth=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });
});

describe('GET /auth/google/callback', () => {
  it('ผู้ใช้ใหม่: สร้างผู้ใช้ + role user + log และ session (เก็บแค่ hash) แล้ว redirect กลับ web', async () => {
    const res = await loginWithGoogle(createApp(), { sub: 'sub-1', email: 'New.User@MSU.ac.th', name: 'สมชาย' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(config.webUrl);

    const cookie = sessionCookieOf(res);
    expect(cookie).toBeTruthy();
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toMatch(/HttpOnly/i);

    const { rows: users } = await pool.query('SELECT id, email, name, last_login_at FROM users WHERE google_sub = $1', [
      'sub-1',
    ]);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('new.user@msu.ac.th');
    expect(users[0].last_login_at).not.toBeNull();

    const { rows: roles } = await pool.query(
      'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1',
      [users[0].id],
    );
    expect(roles.map((r) => r.code)).toEqual(['user']);

    const { rows: logs } = await pool.query('SELECT action, reason, actor_user_id FROM role_change_logs');
    expect(logs).toEqual([{ action: 'grant', reason: FIRST_LOGIN_REASON, actor_user_id: null }]);

    // ในฐานข้อมูลต้องเป็น hash ของ token ไม่ใช่ token ดิบ
    const token = cookie!.split('=')[1]!;
    const { rows: sessions } = await pool.query('SELECT token_hash FROM sessions');
    expect(sessions).toHaveLength(1);
    expect(Buffer.compare(sessions[0].token_hash, hashToken(token))).toBe(0);
  });

  it('ผู้ใช้เดิม: อัปเดตโปรไฟล์ ไม่สร้างผู้ใช้/role/log ซ้ำ', async () => {
    const app = createApp();
    await loginWithGoogle(app, { sub: 'sub-1', email: 'old@msu.ac.th', name: 'ชื่อเดิม' });
    const res = await loginWithGoogle(app, { sub: 'sub-1', email: 'changed@msu.ac.th', name: 'ชื่อใหม่' });

    expect(res.headers.location).toBe(config.webUrl);
    const { rows } = await pool.query('SELECT email, name FROM users');
    expect(rows).toEqual([{ email: 'changed@msu.ac.th', name: 'ชื่อใหม่' }]);
    expect(await countRows('user_roles')).toBe(1);
    expect(await countRows('role_change_logs')).toBe(1);
    expect(await countRows('sessions')).toBe(2);
  });

  it('ปฏิเสธเมื่อ state ไม่ตรงกัน (ไม่เรียก Google เลย)', async () => {
    const spy = vi.spyOn(googleOAuth, 'exchangeCodeForVerifiedIdToken');
    const res = await loginWithGoogle(createApp(), {}, { state: 'forged-state' });

    expect(res.headers.location).toBe(loginErrorUrl('login_failed'));
    expect(sessionCookieOf(res)).toBeNull();
    // loginWithGoogle ตั้ง mock ไว้ 1 ครั้งแต่ต้องไม่ถูกเรียกเพราะ state ผิดตั้งแต่ต้น
    expect(spy).not.toHaveBeenCalled();
    expect(await countRows('users')).toBe(0);
  });

  it('ปฏิเสธเมื่อไม่มี oauth cookie (เช่น เปิด callback ตรง ๆ)', async () => {
    const res = await request(createApp()).get('/auth/google/callback').query({ code: 'x', state: 'y' });
    expect(res.headers.location).toBe(loginErrorUrl('login_failed'));
  });

  it('ปฏิเสธเมื่อผู้ใช้กดยกเลิกที่หน้า Google', async () => {
    const app = createApp();
    const start = await request(app).get('/auth/google');
    const oauthCookie = pickCookie(start, `${config.session.cookieName}_oauth`)!;
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ error: 'access_denied', state: new URL(start.headers.location as string).searchParams.get('state') })
      .set('Cookie', oauthCookie);
    expect(res.headers.location).toBe(loginErrorUrl('login_failed'));
  });

  it('ปฏิเสธเมื่อ nonce ใน ID token ไม่ตรงกัน', async () => {
    const res = await loginWithGoogle(createApp(), { nonce: 'other-nonce' });
    expect(res.headers.location).toBe(loginErrorUrl('login_failed'));
    expect(await countRows('users')).toBe(0);
  });

  it('ปฏิเสธเมื่อ Google แลก code/ตรวจ token ไม่ผ่าน', async () => {
    const app = createApp();
    const start = await request(app).get('/auth/google');
    const oauthCookie = pickCookie(start, `${config.session.cookieName}_oauth`)!;
    vi.spyOn(googleOAuth, 'exchangeCodeForVerifiedIdToken').mockRejectedValueOnce(new Error('invalid_grant'));
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ code: 'x', state: new URL(start.headers.location as string).searchParams.get('state') })
      .set('Cookie', oauthCookie);
    expect(res.headers.location).toBe(loginErrorUrl('login_failed'));
  });

  it('ปฏิเสธเมื่อ email_verified ไม่เป็น true', async () => {
    const res = await loginWithGoogle(createApp(), { email_verified: false });
    expect(res.headers.location).toBe(loginErrorUrl('email_not_verified'));
    expect(await countRows('users')).toBe(0);
  });

  it('ปฏิเสธบัญชีนอกโดเมนที่อนุญาต (gmail.com)', async () => {
    const res = await loginWithGoogle(createApp(), { email: 'someone@gmail.com', hd: undefined });
    expect(res.headers.location).toBe(loginErrorUrl('domain_not_allowed'));
    expect(await countRows('users')).toBe(0);
  });

  it('ปฏิเสธเมื่อ email เป็นโดเมนที่อนุญาตแต่ไม่มี claim hd', async () => {
    const res = await loginWithGoogle(createApp(), { email: 'someone@msu.ac.th', hd: undefined });
    expect(res.headers.location).toBe(loginErrorUrl('domain_not_allowed'));
  });

  it('ปฏิเสธผู้ใช้ที่ถูกปิดใช้งาน และไม่แก้ข้อมูลของผู้ใช้นั้น', async () => {
    const app = createApp();
    await loginWithGoogle(app, { sub: 'sub-1', name: 'ชื่อเดิม' });
    await pool.query("UPDATE users SET is_active = false WHERE google_sub = 'sub-1'");

    const res = await loginWithGoogle(app, { sub: 'sub-1', name: 'ชื่อใหม่' });

    expect(res.headers.location).toBe(loginErrorUrl('account_disabled'));
    expect(sessionCookieOf(res)).toBeNull();
    const { rows } = await pool.query("SELECT name FROM users WHERE google_sub = 'sub-1'");
    expect(rows[0].name).toBe('ชื่อเดิม');
  });

  it('oauth cookie ใช้ได้ครั้งเดียว (ถูกลบใน callback)', async () => {
    const res = await loginWithGoogle(createApp());
    const cleared = pickCookie(res, `${config.session.cookieName}_oauth`);
    expect(cleared).toBe(`${config.session.cookieName}_oauth=`);
  });
});

describe('rate limit ที่ /auth/*', () => {
  it(`เกิน ${config.authRateLimit.max} ครั้งต่อช่วงเวลาได้ 429`, async () => {
    const app = createApp();
    for (let i = 0; i < config.authRateLimit.max; i += 1) {
      const ok = await request(app).get('/auth/google');
      expect(ok.status).toBe(302);
    }
    const limited = await request(app).get('/auth/google');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
