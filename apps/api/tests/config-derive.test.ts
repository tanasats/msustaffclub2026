import { describe, expect, it } from 'vitest';
import { oauthCookiePathOf, parseTrustProxy } from '../src/config/derive.js';

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
