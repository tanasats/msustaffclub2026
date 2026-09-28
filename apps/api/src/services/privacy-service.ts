import { AppError } from '../errors.js';
import { getAcknowledgementState, insertAcknowledgement } from '../repositories/privacy-repository.js';
import type { AuthContext } from './authorization.js';

/**
 * เวอร์ชันของประกาศความเป็นส่วนตัวของระบบ — ต้องตรงกับ PRIVACY_NOTICE_VERSION ใน
 * apps/web/src/components/privacy/PrivacyNotice.tsx (หน้าเว็บส่งเวอร์ชันที่ผู้ใช้เห็นมาตอนกดรับทราบ)
 * แก้สาระสำคัญของประกาศ = เพิ่มเวอร์ชันทั้งสองที่ = ผู้ใช้ทุกคนต้องรับทราบใหม่
 */
export const PRIVACY_NOTICE_VERSION = '1.0';

// ต้อง login เท่านั้น: สถานะการรับทราบประกาศของตัวเอง
export async function getMyPrivacyStatus(auth: AuthContext) {
  return { currentVersion: PRIVACY_NOTICE_VERSION, ...(await getAcknowledgementState(auth.user.id, PRIVACY_NOTICE_VERSION)) };
}

// ต้อง login เท่านั้น: รับทราบประกาศเวอร์ชันปัจจุบัน (เวอร์ชันที่หน้าเว็บแสดงต้องตรงกับของระบบ)
export async function acknowledgePrivacyNotice(auth: AuthContext, version: string): Promise<void> {
  if (version !== PRIVACY_NOTICE_VERSION) {
    throw new AppError(409, 'PRIVACY_NOTICE_OUTDATED', 'ประกาศความเป็นส่วนตัวมีการปรับปรุง กรุณาโหลดหน้าใหม่แล้วอ่านฉบับล่าสุด');
  }
  await insertAcknowledgement(auth.user.id, version);
}
