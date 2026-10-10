import { apiFetch } from './api-server';

export interface StudentProfile {
  studentCode: string;
  faculty: { code: string; nameTh: string } | null;
}

export interface StaffProfile {
  staffCode: string;
  fullNameTh: string | null;
  positionNameTh: string | null;
  facultyName: string | null;
  departmentName: string | null;
  programName: string | null;
  orgUnit: { code: string; nameTh: string } | null;
  syncedAt: string;
}

export type UserProfile =
  | { type: 'student'; student: StudentProfile | null }
  | { type: 'staff'; staff: StaffProfile | null };

export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface UserPreferences {
  fontScale: FontScale;
  // รับอีเมลแจ้งเตือนจากระบบ (การแจ้งเตือนในระบบแสดงเสมอ)
  emailNotifications: boolean;
}

// ตัวเลขงานที่ปรึกษาชมรม (จาก /auth/me) ใช้ตัดสินการแสดงเมนูและตัวเลขงานค้าง
export interface AdvisorSummary {
  pendingConsents: number;
  activeClubs: number;
  reportsToAcknowledge: number;
}

export interface CurrentUser {
  user: {
    id: string;
    email: string;
    name: string | null;
    pictureUrl: string | null;
  };
  roles: string[];
  permissions: string[];
  profile: UserProfile;
  preferences: UserPreferences;
  advisor: AdvisorSummary;
  // จำนวนคำเสนอชื่อเป็นประธานชมรมที่รอฉันตอบ
  // และจำนวนคำเชิญเข้าชมรมที่รอฉันตอบ
  nominations: { pendingPresident: number; clubInvitations: number };
  // ประกาศความเป็นส่วนตัว: ยังไม่รับทราบเวอร์ชันปัจจุบัน = แสดงหน้ารับทราบแทนทุกหน้า
  privacy: { currentVersion: string; acknowledged: boolean; acknowledgedEarlier: boolean };
  // การแจ้งเตือนในระบบที่ยังไม่อ่าน (ตัวเลขบนกระดิ่ง)
  notifications: { unread: number };
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
