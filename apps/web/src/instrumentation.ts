// เรียกครั้งเดียวตอนเริ่ม Next.js server (ไม่ใช่ตอน build): ตรวจ env ที่จำเป็น ขาด = server ไม่เริ่ม
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertServerEnv } = await import('./lib/server-env');
    assertServerEnv();
  }
}
