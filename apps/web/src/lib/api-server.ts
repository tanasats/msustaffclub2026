import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
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

/**
 * GET JSON จาก API สำหรับหน้าที่ต้อง login
 * 401 → ไปหน้า login, 403 → หน้าไม่มีสิทธิ์, 404 → หน้าไม่พบ, อื่น ๆ → throw ให้ error boundary แสดง
 */
export async function apiGetJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (res.status === 401) redirect('/login');
  if (res.status === 403) redirect('/forbidden');
  if (res.status === 404) notFound();
  if (!res.ok) {
    throw new Error(`เรียก ${path} ไม่สำเร็จ (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}
