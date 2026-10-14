// ข้อความถึงผู้ใช้หลายคน: ประกาศจากสโมสรบุคลากร และข้อความจากกรรมการชมรมถึงสมาชิก
export type StaffAudience = 'all_staff' | 'club_committees' | 'club_members' | 'org_units' | 'individual';

export const STAFF_AUDIENCE_LABELS: Record<StaffAudience, string> = {
  all_staff: 'บุคลากรทุกคนในระบบ',
  club_committees: 'กรรมการชมรมทุกชมรม',
  club_members: 'สมาชิกชมรมทุกชมรม',
  org_units: 'ตามหน่วยงาน',
  individual: 'รายบุคคล',
};

export interface BroadcastItem {
  id: string;
  audience: StaffAudience | 'club';
  orgUnitNames: string[];
  // ผู้รับรายบุคคล (audience = individual)
  recipientName: string | null;
  title: string;
  body: string;
  recipientCount: number;
  senderName: string | null;
  createdAt: string;
}

export interface BroadcastPage {
  items: BroadcastItem[];
  total: number;
}

export interface OrgUnitOption {
  id: string;
  code: string;
  nameTh: string;
}
