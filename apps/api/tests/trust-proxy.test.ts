import { describe, expect, it } from 'vitest';

// ตั้ง env ก่อนโหลดแอป (vitest แยก module ต่อไฟล์ config จึงอ่านค่านี้ใหม่): จำลอง production หลัง nginx 1 hop
process.env.TRUST_PROXY = '1';
process.env.AUTH_RATE_LIMIT_MAX = '2';
const { createApp } = await import('../src/app.js');
const { request } = await import('./helpers/http.js');

const app = createApp();
// nginx ต่อท้าย IP จริงของผู้ใช้ใน X-Forwarded-For; ค่าด้านซ้ายผู้ใช้ปลอมมาได้
const fromUser = (ip: string, spoofed?: string) =>
  request(app).get('/auth/google').set('X-Forwarded-For', spoofed ? `${spoofed}, ${ip}` : ip);

describe('trust proxy + rate limit หลัง nginx', () => {
  it('นับ rate limit แยกตาม IP จริงของผู้ใช้ ไม่ใช่รวมกันที่ IP ของ nginx', async () => {
    expect((await fromUser('203.0.113.10')).status).toBe(302);
    expect((await fromUser('203.0.113.10')).status).toBe(302);
    expect((await fromUser('203.0.113.10')).status).toBe(429);
    // ผู้ใช้อีกคนยังเข้าได้
    expect((await fromUser('203.0.113.20')).status).toBe(302);
  });

  it('ปลอม X-Forwarded-For ด้านซ้ายไม่ช่วยหลบ rate limit (เชื่อเฉพาะ hop ที่ nginx ใส่)', async () => {
    expect((await fromUser('198.51.100.7', '1.1.1.1')).status).toBe(302);
    expect((await fromUser('198.51.100.7', '2.2.2.2')).status).toBe(302);
    expect((await fromUser('198.51.100.7', '3.3.3.3')).status).toBe(429);
  });
});
