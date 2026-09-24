import { cookies } from 'next/headers';
import { serverEnv } from './server-env';

/**
 * เรียก API จาก Server Component โดยส่งต่อ cookie ของผู้ใช้
 * (ถ้าไม่ส่งต่อ API จะมองว่าผู้ใช้ยังไม่ login)
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }
  return fetch(`${serverEnv.apiUrl}${path}`, { ...init, headers, cache: 'no-store' });
}
