import type { IconName } from '@/components/ui/icons';
import type { CurrentUser } from './auth';

export interface NavItem {
  href: string;
  label: string;
  // ชื่อสั้นสำหรับแถบเมนูล่างบนมือถือ
  shortLabel: string;
  icon: IconName;
  // main = ใช้ทั่วไป, work = งานตามบทบาท (ที่ปรึกษา/เจ้าหน้าที่/กรรมการคัดเลือก), admin = ผู้ดูแลระบบ
  group: 'main' | 'work' | 'admin';
  // จำนวนงานค้าง (แสดงเป็นตัวเลขบนเมนู) ไม่มี/0 = ไม่แสดง
  badge?: number;
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
    // ตัวเลข = คำเชิญเข้าชมรมที่รอฉันตอบ
    { href: '/clubs', label: 'ทำเนียบชมรม', shortLabel: 'ชมรม', icon: 'users', group: 'main', badge: current.nominations.clubInvitations },
  ];

  if (has('club_application:create')) {
    items.push({
      href: '/club-applications',
      label: 'คำขอจัดตั้ง/ต่อทะเบียน',
      shortLabel: 'คำขอ',
      icon: 'scroll',
      group: 'main',
      // คำขอที่เสนอชื่อฉันเป็นประธานและรอฉันตอบ
      badge: current.nominations.pendingPresident,
    });
  }
  // ต้อง login เท่านั้น: ติดตามสถานะผลงานของตัวเอง
  items.push({ href: '/achievements', label: 'ผลงานของฉัน', shortLabel: 'ผลงาน', icon: 'award', group: 'main' });
  // แสดงเฉพาะผู้ที่มีคำขอรอยินยอม หรือเป็นที่ปรึกษาชมรมที่ยังอยู่ในวาระ (บุคลากรส่วนใหญ่ไม่ใช่ที่ปรึกษา)
  const { advisor } = current;
  if (advisor.pendingConsents > 0 || advisor.activeClubs > 0) {
    items.push({
      href: '/advisor',
      label: 'งานที่ปรึกษาชมรม',
      shortLabel: 'ที่ปรึกษา',
      icon: 'leaf',
      group: 'work',
      badge: advisor.pendingConsents + advisor.reportsToAcknowledge,
    });
  }
  if (has('club_application:review') || has('club_application:approve') || has('club:read_all')) {
    items.push({ href: '/club-applications/queue', label: 'ตรวจและอนุมัติคำขอ', shortLabel: 'อนุมัติ', icon: 'inbox', group: 'work' });
  }
  // กำกับติดตามคำขอทุกสถานะ (super_admin ผ่านทุกสิทธิ์)
  if (has('club:read_all')) {
    items.push({ href: '/club-applications/all', label: 'คำขอทั้งหมด', shortLabel: 'คำขอทั้งหมด', icon: 'scroll', group: 'admin' });
  }
  if (has('club_report:review')) {
    items.push({ href: '/reports/overview', label: 'ภาพรวมการส่งรายงาน', shortLabel: 'รายงาน', icon: 'check', group: 'work' });
  }
  if (has('sport_selection:manage')) {
    items.push({ href: '/selections', label: 'การคัดเลือกนักกีฬา', shortLabel: 'คัดเลือก', icon: 'award', group: 'work' });
  }
  // ต้อง login เท่านั้น: ประกาศผลคัดเลือก
  items.push({ href: '/announcements', label: 'ประกาศผลคัดเลือก', shortLabel: 'ประกาศ', icon: 'scroll', group: 'main' });
  if (has('sport:manage')) {
    items.push({ href: '/admin/sports', label: 'ชนิดกีฬา', shortLabel: 'กีฬา', icon: 'award', group: 'admin' });
  }
  if (has('user_role:assign')) {
    items.push({ href: '/admin/users', label: 'จัดการสิทธิ์ผู้ใช้', shortLabel: 'สิทธิ์', icon: 'shield', group: 'admin' });
  }
  if (has('system_setting:manage')) {
    items.push({ href: '/admin/email', label: 'อีเมลแจ้งเตือน', shortLabel: 'อีเมล', icon: 'settings', group: 'admin' });
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
  sport_selection_committee: 'คณะกรรมการคัดเลือก',
};
