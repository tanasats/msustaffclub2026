import type { PublicStats } from './public-types';
import { serverEnv } from './server-env';

// ตัวเลขสรุปสำหรับหน้า landing (public ไม่ส่ง cookie) — ขัดข้องให้คืน null แล้วหน้าจะซ่อนส่วนตัวเลขแทนการพังทั้งหน้า
export async function loadPublicStats(): Promise<PublicStats | null> {
  try {
    const res = await fetch(`${serverEnv.apiUrl}/public/stats`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as PublicStats) : null;
  } catch {
    return null;
  }
}
