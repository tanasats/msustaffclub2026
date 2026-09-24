import { config } from '../config/index.js';
import { classifyAccount } from './account-type.js';

// กฎทางธุรกิจของชมรมรวมไว้ที่เดียว (แก้ที่นี่เมื่อองค์กรเปลี่ยนนโยบาย)

// สมาชิกตั้งต้นขั้นต่ำตอนยื่นคำขอ (นับรวมกรรมการ)
export const MIN_INITIAL_MEMBERS = 5;
export const MAX_ADVISORS = 2;
export const MAX_OBJECTIVES = 20;

/**
 * ใครเป็นสมาชิก/กรรมการ/ที่ปรึกษาชมรมได้
 * ระเบียบนิยาม "สมาชิก = บุคลากร มมส." → ระหว่างนี้เปิดให้เฉพาะบัญชีบุคลากร (ยังรอยืนยันเรื่องนิสิต)
 */
export function isEligibleForClub(email: string): boolean {
  return classifyAccount(email).type === 'staff';
}

// email ที่ใช้ระบุที่ปรึกษาต้องอยู่ในโดเมนที่ระบบรับ login (ไม่เช่นนั้นที่ปรึกษาจะ login มายินยอมไม่ได้)
export function isAllowedEmailDomain(email: string): boolean {
  const allowed = config.google.allowedEmailDomains;
  if (allowed.length === 0) return true;
  return allowed.includes(email.slice(email.lastIndexOf('@') + 1).toLowerCase());
}

// สถานะคำขอที่ผู้ยื่นแก้ไขได้
export const EDITABLE_APPLICATION_STATUSES = ['draft', 'returned'] as const;
// สถานะคำขอที่ผู้ยื่นยกเลิกได้ (ยื่นแล้วยกเลิกเองไม่ได้ ต้องให้สโมสรส่งกลับก่อน)
export const CANCELLABLE_APPLICATION_STATUSES = ['draft', 'returned', 'awaiting_consent'] as const;

const CLUB_PREFIX = 'ชมรม';

// ชื่อเต็มที่ขึ้นต้นด้วย "ชมรม" เสมอ (ผู้ใช้อาจกรอก "ดนตรีไทย" หรือ "ชมรมดนตรีไทย" ก็ได้)
export function clubFullName(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith(CLUB_PREFIX) ? trimmed : `${CLUB_PREFIX}${trimmed}`;
}

/**
 * เติมตัวแปรในแม่แบบระเบียบ
 * แม่แบบเขียนว่า "ชมรม{{club_name}}" จึงแทนทั้งก้อนด้วยชื่อเต็ม เพื่อไม่ให้เกิด "ชมรมชมรม..."
 */
export function fillRegulationTemplate(template: string, values: { clubName: string; year: string }): string {
  const fullName = clubFullName(values.clubName);
  return template
    .replaceAll(`${CLUB_PREFIX}{{club_name}}`, fullName)
    .replaceAll('{{club_name}}', fullName)
    .replaceAll('{{year}}', values.year);
}
