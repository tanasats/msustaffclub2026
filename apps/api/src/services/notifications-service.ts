import { AppError } from '../errors.js';
import {
  countUnreadNotifications,
  deleteOldNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../repositories/notifications-repository.js';
import type { AuthContext } from './authorization.js';

// เก็บการแจ้งเตือนในระบบ 180 วัน แล้วลบอัตโนมัติ (PDPA: เก็บเท่าที่จำเป็น)
export const NOTIFICATION_RETENTION_DAYS = 180;

// ต้อง login เท่านั้น — ทุกฟังก์ชันใช้ได้กับการแจ้งเตือนของตัวเองเท่านั้น
export async function listMyNotifications(auth: AuthContext, query: { page: number; pageSize: number }) {
  const [page, unread] = await Promise.all([
    listNotifications(auth.user.id, query.pageSize, (query.page - 1) * query.pageSize),
    countUnreadNotifications(auth.user.id),
  ]);
  return { ...page, unread };
}

export async function getMyUnreadNotificationCount(auth: AuthContext): Promise<number> {
  return countUnreadNotifications(auth.user.id);
}

export async function markMyNotificationRead(auth: AuthContext, id: string): Promise<void> {
  if (!(await markNotificationRead(auth.user.id, id))) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบการแจ้งเตือนนี้');
  }
}

export async function markAllMyNotificationsRead(auth: AuthContext): Promise<void> {
  await markAllNotificationsRead(auth.user.id);
}

// งานตามรอบ: ลบการแจ้งเตือนที่เก่ากว่าระยะเก็บ
export async function purgeOldNotifications(): Promise<number> {
  return deleteOldNotifications(NOTIFICATION_RETENTION_DAYS);
}
