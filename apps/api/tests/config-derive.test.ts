import { describe, expect, it } from 'vitest';
import { mailConfigOf, oauthCookiePathOf, parseTrustProxy } from '../src/config/derive.js';

describe('oauthCookiePathOf', () => {
  it('dev: API อยู่ที่ root → /auth/google', () => {
    expect(oauthCookiePathOf('http://localhost:4000/auth/google/callback')).toBe('/auth/google');
  });

  it('production: API อยู่ใต้ /api → /api/auth/google (cookie ต้องถูกส่งกลับตอน callback)', () => {
    expect(oauthCookiePathOf('https://club.msu.ac.th/api/auth/google/callback')).toBe('/api/auth/google');
    expect(oauthCookiePathOf('https://club.msu.ac.th/api/auth/google/callback/')).toBe('/api/auth/google');
  });

  it('URI ที่ไม่ลงท้ายด้วย /callback → error ตอนเริ่มระบบ', () => {
    expect(() => oauthCookiePathOf('https://club.msu.ac.th/api/auth/google')).toThrow('/callback');
  });
});

describe('parseTrustProxy', () => {
  it('ว่าง/false → ไม่เชื่อ proxy', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('ตัวเลข → จำนวน hop, ข้อความอื่น → รายการ IP/เครือข่าย', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' loopback, 10.0.0.0/8 ')).toBe('loopback, 10.0.0.0/8');
  });

  it('true ไม่อนุญาต (ปลอม X-Forwarded-For หลบ rate limit ได้)', () => {
    expect(() => parseTrustProxy('true')).toThrow('ไม่ปลอดภัย');
  });
});

describe('mailConfigOf', () => {
  const gmailEnv = {
    MAIL_TRANSPORT: 'gmail',
    MAIL_FROM_ADDRESS: 'Staff.Club@msu.ac.th',
    GMAIL_CLIENT_ID: 'id',
    GMAIL_CLIENT_SECRET: 'secret',
    GMAIL_REFRESH_TOKEN: 'token',
  };

  it('ไม่กำหนด → log (ระบบทำงานได้แต่ไม่ส่งอีเมล), ช่วงเวลา worker เริ่มต้น 30 วินาที', () => {
    expect(mailConfigOf({})).toMatchObject({ transport: 'log', gmail: null, workerIntervalMs: 30_000 });
  });

  it('gmail ครบ → ใช้ได้ (อีเมลผู้ส่งเป็นตัวพิมพ์เล็ก)', () => {
    expect(mailConfigOf(gmailEnv)).toMatchObject({
      transport: 'gmail',
      fromAddress: 'staff.club@msu.ac.th',
      gmail: { clientId: 'id', clientSecret: 'secret', refreshToken: 'token' },
    });
  });

  it('gmail แต่ขาดค่า → error บอกชื่อตัวแปรที่ขาด; ค่าไม่ถูกต้อง → error', () => {
    expect(() => mailConfigOf({ ...gmailEnv, GMAIL_REFRESH_TOKEN: ' ' })).toThrow('GMAIL_REFRESH_TOKEN');
    expect(() => mailConfigOf({ MAIL_TRANSPORT: 'smtp' })).toThrow('log หรือ gmail');
    expect(() => mailConfigOf({ MAIL_WORKER_INTERVAL_SECONDS: '1' })).toThrow('อย่างน้อย 5');
  });
});
