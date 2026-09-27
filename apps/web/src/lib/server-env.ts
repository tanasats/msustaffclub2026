// ค่า env ที่ใช้ฝั่ง server เท่านั้น (ห้าม import ใน Client Component)
// อ่านตอนใช้งาน (getter) ไม่ใช่ตอน import เพราะ `next build` import ทุกหน้าโดยยังไม่มี env ของ production
// การตรวจครบทุกตัวตอนเริ่ม server อยู่ที่ src/instrumentation.ts
const REQUIRED = ['API_URL', 'SESSION_COOKIE_NAME'] as const;

function requireEnv(name: (typeof REQUIRED)[number]): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`ต้องกำหนด ${name} (dev: apps/web/.env.local, production: ไฟล์ env ของ web)`);
  }
  return value;
}

export const serverEnv = {
  get apiUrl(): string {
    return requireEnv('API_URL');
  },
  get sessionCookieName(): string {
    return requireEnv('SESSION_COOKIE_NAME');
  },
};

// เรียกตอนเริ่ม server: ขาดตัวใดให้หยุดทำงานทันที
export function assertServerEnv(): void {
  for (const name of REQUIRED) requireEnv(name);
}
