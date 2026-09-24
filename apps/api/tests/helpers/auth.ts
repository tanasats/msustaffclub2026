import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Response } from 'supertest';
import { request } from './http.js';
import { vi } from 'vitest';
import { config } from '../../src/config/index.js';
import { pool } from '../../src/db/pool.js';
import { erpHr, type ErpStaffInfo } from '../../src/services/erp-hr-client.js';
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

export const FAKE_ACCESS_TOKEN = 'fake-google-access-token';

export const SAMPLE_STAFF_INFO: ErpStaffInfo = {
  staffCode: '1234567',
  prefixNameTh: 'นาย',
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  prefixNameEn: 'Mr.',
  firstNameEn: 'Somchai',
  lastNameEn: 'Jaidee',
  positionNameTh: 'นักวิชาการคอมพิวเตอร์',
  erpFacultyId: '201092700000',
  erpFacultyName: 'สำนักงานอธิการบดี',
  erpDepartmentId: '201092704000',
  erpDepartmentName: 'กองแผนงาน',
  erpProgramId: '201092704003',
  erpProgramName: 'กลุ่มงานสารสนเทศ',
};

export interface LoginOptions {
  state?: string;
  // ผลที่ ERP-HR จะคืน (ค่าเริ่มต้น null = ไม่พบข้อมูล) หรือ Error = เรียกไม่สำเร็จ
  erp?: ErpStaffInfo | null | Error;
}

/**
 * จำลอง login ทั้ง flow: GET /auth/google → (mock Google) → GET /auth/google/callback
 * mock เฉพาะการเรียกภายนอก (Google, ERP-HR) ฐานข้อมูลเป็นของจริง
 */
export async function loginWithGoogle(
  app: Express,
  claims: GoogleClaims = {},
  options: LoginOptions = {},
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
  vi.spyOn(googleOAuth, 'exchangeCodeForVerifiedIdToken').mockResolvedValueOnce({
    payload,
    accessToken: FAKE_ACCESS_TOKEN,
  });
  const erp = options.erp === undefined ? null : options.erp;
  const erpSpy = vi.spyOn(erpHr, 'fetchStaffInfo');
  if (erp instanceof Error) {
    erpSpy.mockRejectedValueOnce(erp);
  } else {
    erpSpy.mockResolvedValueOnce(erp);
  }

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
