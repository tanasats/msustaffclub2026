import { publicEnv } from './public-env';

export interface ApiResult {
  ok: boolean;
  // ข้อความ error จาก API (รูปแบบ { error: { code, message } }) สำหรับแสดงผู้ใช้
  errorMessage?: string;
}

/**
 * เรียก API ที่เปลี่ยนข้อมูลจาก Client Component (ส่ง cookie ด้วย credentials: 'include')
 * browser ใส่ header Origin ให้เองซึ่ง API ใช้ตรวจ CSRF
 */
export async function apiSend(method: 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, errorMessage: data?.error?.message ?? `เกิดข้อผิดพลาด (HTTP ${res.status})` };
  } catch {
    return { ok: false, errorMessage: 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่' };
  }
}

/**
 * GET JSON จาก API ฝั่ง browser (เช่น ค้นหาผู้ใช้ขณะพิมพ์) คืน null ถ้าไม่สำเร็จ
 */
export async function apiGetClient<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}${path}`, { credentials: 'include' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
