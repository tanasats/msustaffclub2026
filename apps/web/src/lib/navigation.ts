import type { IconName } from '@/components/ui/icons';
import type { CurrentUser } from './auth';

export interface NavItem {
  href: string;
  label: string;
  // ชื่อสั้นสำหรับแถบเมนูล่างบนมือถือ
  shortLabel: string;
  icon: IconName;
  group: 'main' | 'admin';
}

/**
 * เมนูตามสิทธิ์ของผู้ใช้ (เพื่อ UX เท่านั้น API ตรวจสิทธิ์จริงทุกครั้ง)
 */
export function buildNavigation(current: CurrentUser): NavItem[] {
  const has = (permission: string) =>
    current.roles.includes('super_admin') || current.permissions.includes(permission);
  const items: NavItem[] = [
    { href: '/', label: 'หน้าหลัก', shortLabel: 'หน้าหลัก', icon: 'home', group: 'main' },
    // ทุกคนที่ login ดูทำเนียบชมรมได้
    { href: '/clubs', label: 'ทำเนียบชมรม', shortLabel: 'ชมรม', icon: 'users', group: 'main' },
  ];

  if (has('club_application:create')) {
    items.push({ href: '/club-applications', label: 'คำขอจัดตั้งชมรม', shortLabel: 'คำขอ', icon: 'scroll', group: 'main' });
  }
  // ต้อง login เท่านั้น: ติดตามสถานะผลงานของตัวเอง
  items.push({ href: '/achievements', label: 'ผลงานของฉัน', shortLabel: 'ผลงาน', icon: 'award', group: 'main' });
  if (current.profile.type === 'staff') {
    items.push({
      href: '/club-applications/advisor-requests',
      label: 'งานที่ปรึกษาชมรม',
      shortLabel: 'ที่ปรึกษา',
      icon: 'leaf',
      group: 'main',
    });
  }
  if (has('club_application:review') || has('club_application:approve') || has('club:read_all')) {
    items.push({ href: '/club-applications/queue', label: 'ตรวจและอนุมัติคำขอ', shortLabel: 'อนุมัติ', icon: 'inbox', group: 'main' });
  }
  if (has('user_role:assign')) {
    items.push({ href: '/admin/users', label: 'จัดการสิทธิ์ผู้ใช้', shortLabel: 'สิทธิ์', icon: 'shield', group: 'admin' });
  }
  return items;
}

// ชื่อ role ภาษาไทยสำหรับแสดงผล (role ใหม่ที่ไม่มีในรายการแสดงเป็น code)
export const ROLE_LABELS: Record<string, string> = {
  user: 'ผู้ใช้งานทั่วไป',
  staff: 'บุคลากร',
  student: 'นิสิต',
  super_admin: 'ผู้ดูแลระบบสูงสุด',
  club_officer: 'เจ้าหน้าที่สโมสร',
  club_president: 'นายกสโมสร',
};
