// ค่าที่คำนวณจาก env (แยกจาก index.ts เพื่อให้ทดสอบได้โดยไม่ต้องโหลด config ทั้งชุด)

/**
 * path ของ cookie ชั่วคราวระหว่าง login กับ Google = path ของ GOOGLE_REDIRECT_URI ตัด "/callback" ออก
 * dev:        http://localhost:4000/auth/google/callback        → /auth/google
 * production: https://club.msu.ac.th/api/auth/google/callback   → /api/auth/google (nginx ส่ง API ไว้ใต้ /api)
 * browser จึงส่ง cookie กลับมาตอน callback ถูกต้องไม่ว่า API จะอยู่ใต้ prefix ใด
 */
export function oauthCookiePathOf(redirectUri: string): string {
  const path = new URL(redirectUri).pathname.replace(/\/+$/, '');
  if (!path.endsWith('/callback')) {
    throw new Error('GOOGLE_REDIRECT_URI ต้องลงท้ายด้วย /callback');
  }
  return path.slice(0, -'/callback'.length) || '/';
}

export type TrustProxySetting = false | number | string;

/**
 * ค่า trust proxy ของ Express (ใช้หา IP จริงของผู้ใช้จาก X-Forwarded-For เมื่ออยู่หลัง nginx)
 * - ว่าง / "false" → ไม่เชื่อ proxy (dev ที่ไม่มี nginx)
 * - ตัวเลข เช่น "1"  → เชื่อ proxy ใกล้สุดตามจำนวน hop (production: nginx 1 ตัว)
 * - อื่น ๆ เช่น "loopback, 10.0.0.0/8" → เชื่อเฉพาะ IP/เครือข่ายที่ระบุ
 * ห้าม "true" เพราะจะเชื่อ X-Forwarded-For ทุกค่า ผู้ใช้ปลอม IP หลบ rate limit ได้
 */
export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const trimmed = (value ?? '').trim();
  if (trimmed === '' || trimmed === 'false') return false;
  if (trimmed === 'true') {
    throw new Error('TRUST_PROXY=true ไม่ปลอดภัย ให้ระบุจำนวน hop (เช่น 1) หรือ IP/เครือข่ายของ proxy');
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export interface MailConfig {
  // log = ไม่ส่งจริง (dev/test) บันทึกเฉพาะประเภทและ id, gmail = ส่งผ่าน Gmail API
  transport: 'log' | 'gmail';
  fromAddress: string | null;
  fromName: string;
  gmail: { clientId: string; clientSecret: string; refreshToken: string } | null;
  workerIntervalMs: number;
}

export interface MailEnv {
  MAIL_TRANSPORT?: string;
  MAIL_FROM_ADDRESS?: string;
  MAIL_FROM_NAME?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  MAIL_WORKER_INTERVAL_SECONDS?: string;
}

/**
 * ตั้งค่าการส่งอีเมล (ดู docs/email-setup.md)
 * ไม่กำหนด MAIL_TRANSPORT = log (ระบบทำงานได้ปกติแต่ไม่ส่งอีเมล)
 * gmail ต้องมีค่าครบทุกตัว ไม่เช่นนั้นหยุดตอนเริ่มระบบพร้อมบอกชื่อที่ขาด
 */
export function mailConfigOf(env: MailEnv): MailConfig {
  const value = (name: keyof MailEnv) => env[name]?.trim() || undefined;
  const transport = value('MAIL_TRANSPORT') ?? 'log';
  if (transport !== 'log' && transport !== 'gmail') {
    throw new Error('MAIL_TRANSPORT ต้องเป็น log หรือ gmail');
  }
  const interval = Number(value('MAIL_WORKER_INTERVAL_SECONDS') ?? 30);
  if (!Number.isInteger(interval) || interval < 5) {
    throw new Error('MAIL_WORKER_INTERVAL_SECONDS ต้องเป็นจำนวนเต็มอย่างน้อย 5');
  }
  const fromAddress = value('MAIL_FROM_ADDRESS')?.toLowerCase() ?? null;
  const base = { fromAddress, fromName: value('MAIL_FROM_NAME') ?? 'ระบบบริหารจัดการชมรมบุคลากร', workerIntervalMs: interval * 1000 };
  if (transport === 'log') {
    return { ...base, transport, gmail: null };
  }
  const required = ['MAIL_FROM_ADDRESS', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const;
  const missing = required.filter((name) => !value(name));
  if (missing.length > 0) {
    throw new Error(`MAIL_TRANSPORT=gmail ต้องกำหนด ${missing.join(', ')}`);
  }
  return {
    ...base,
    transport,
    gmail: { clientId: value('GMAIL_CLIENT_ID')!, clientSecret: value('GMAIL_CLIENT_SECRET')!, refreshToken: value('GMAIL_REFRESH_TOKEN')! },
  };
}
