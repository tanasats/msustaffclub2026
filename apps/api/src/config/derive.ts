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
