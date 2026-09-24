import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request, { type Response } from 'supertest';
import { vi } from 'vitest';
import { config } from '../../src/config/index.js';
import { pool } from '../../src/db/pool.js';
import { googleOAuth, type GoogleIdTokenPayload } from '../../src/services/google-oauth-client.js';
import { generateToken, hashToken } from '../../src/services/session-token.js';

export const WEB_ORIGIN = config.webOrigin;

// ดึงค่า cookie ชื่อที่ต้องการจาก header Set-Cookie ในรูป "name=value" สำหรับส่งกลับ
export function pickCookie(res: Response, name: string): string | null {
  const raw = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0]! : null;
}

export function sessionCookieOf(res: Response): string | null {
  const cookie = pickCookie(res, config.session.cookieName);
  // clearCookie ส่งค่าว่างมา ไม่นับเป็น session
  return cookie && cookie !== `${config.session.cookieName}=` ? cookie : null;
}

export interface GoogleClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  hd?: string | undefined;
  name?: string;
  picture?: string;
  nonce?: string;
}

/**
 * จำลอง login ทั้ง flow: GET /auth/google → (mock Google) → GET /auth/google/callback
 * mock เฉพาะการแลก code/ตรวจ ID token กับ Google ฐานข้อมูลเป็นของจริง
 */
export async function loginWithGoogle(
  app: Express,
  claims: GoogleClaims = {},
  options: { state?: string } = {},
): Promise<Response> {
  const start = await request(app).get('/auth/google');
  const location = new URL(start.headers.location as string);
  const oauthCookie = pickCookie(start, `${config.session.cookieName}_oauth`);
  if (!oauthCookie) throw new Error('ไม่ได้รับ oauth cookie');

  const nonce = location.searchParams.get('nonce') ?? '';
  const payload: GoogleIdTokenPayload = {
    iss: 'https://accounts.google.com',
    aud: config.google.clientId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: claims.sub ?? `google-${randomUUID()}`,
    email: claims.email ?? 'someone@msu.ac.th',
    email_verified: claims.email_verified ?? true,
    name: claims.name ?? 'ผู้ใช้ทดสอบ',
    picture: claims.picture ?? 'https://example.com/pic.png',
    nonce: claims.nonce ?? nonce,
    ...('hd' in claims ? { hd: claims.hd } : { hd: 'msu.ac.th' }),
  };
  vi.spyOn(googleOAuth, 'exchangeCodeForVerifiedIdToken').mockResolvedValueOnce(payload);

  const state = options.state ?? location.searchParams.get('state') ?? '';
  return request(app)
    .get('/auth/google/callback')
    .query({ code: 'fake-code', state })
    .set('Cookie', oauthCookie);
}

// สร้าง session ตรง ๆ ในฐานข้อมูล (ข้ามขั้นตอน Google) คืน cookie สำหรับแนบกับ request
export async function createSessionCookie(userId: string, options: { expired?: boolean } = {}): Promise<string> {
  const token = generateToken();
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, options.expired ? '-1' : '1'],
  );
  return `${config.session.cookieName}=${token}`;
}

export async function grantRole(userId: string, roleCode: string): Promise<void> {
  await pool.query(
    'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2',
    [userId, roleCode],
  );
}
