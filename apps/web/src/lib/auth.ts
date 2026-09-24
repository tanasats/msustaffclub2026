import { apiFetch } from './api-server';

export interface CurrentUser {
  user: {
    id: string;
    email: string;
    name: string | null;
    pictureUrl: string | null;
  };
  roles: string[];
  permissions: string[];
}

/**
 * ถามผู้ใช้ปัจจุบันจาก API (ส่งต่อ cookie ของผู้ใช้)
 * คืน null ถ้ายังไม่ login หรือ session หมดอายุ, error อื่นโยนต่อให้หน้า error แสดง
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const res = await apiFetch('/auth/me');
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`เรียก /auth/me ไม่สำเร็จ (HTTP ${res.status})`);
  }
  return (await res.json()) as CurrentUser;
}
