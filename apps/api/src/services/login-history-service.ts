import { deleteOldLoginEvents } from '../repositories/login-events-repository.js';

// เก็บประวัติการเข้าระบบ 180 วัน แล้วลบอัตโนมัติ (PDPA: เก็บเท่าที่จำเป็น)
export const LOGIN_EVENT_RETENTION_DAYS = 180;

// งานตามรอบ: ลบประวัติการเข้าระบบที่เก่ากว่าระยะเก็บ
export async function purgeOldLoginEvents(): Promise<number> {
  return deleteOldLoginEvents(LOGIN_EVENT_RETENTION_DAYS);
}
