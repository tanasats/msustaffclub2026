import { findStaffProfile, findStudentProfile, type StaffProfile, type StudentProfile } from '../repositories/profiles-repository.js';
import { classifyAccount } from './account-type.js';

export type UserProfile =
  | { type: 'student'; student: StudentProfile | null }
  // staff = null เมื่อยังดึงข้อมูลจาก ERP-HR ไม่สำเร็จ
  | { type: 'staff'; staff: StaffProfile | null };

// ประเภทบัญชีดูจาก email แล้วอ่านข้อมูลจากตารางของประเภทนั้น
export async function getUserProfile(userId: string, email: string): Promise<UserProfile> {
  const account = classifyAccount(email);
  if (account.type === 'student') {
    return { type: 'student', student: await findStudentProfile(userId) };
  }
  return { type: 'staff', staff: await findStaffProfile(userId) };
}
