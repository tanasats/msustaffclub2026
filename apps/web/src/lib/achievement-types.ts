// รูปแบบข้อมูลจาก API ผลงาน (ต้องตรงกับ apps/api/src/services/achievement-service.ts)

export type AchievementStatus = 'pending' | 'approved' | 'returned' | 'rejected' | 'withdrawn';
export type AchievementAction = 'submitted' | 'updated' | 'resubmitted' | 'withdrawn' | 'approved' | 'returned' | 'rejected';

// ระดับและประเภท ต้องตรงกับ ACHIEVEMENT_LEVELS / ACHIEVEMENT_CATEGORIES ของ API
export const LEVEL_OPTIONS = [
  { value: 'international', label: 'นานาชาติ' },
  { value: 'national', label: 'ประเทศ' },
  { value: 'regional', label: 'ภูมิภาค' },
  { value: 'provincial', label: 'จังหวัด' },
  { value: 'university', label: 'มหาวิทยาลัย' },
  { value: 'club', label: 'ภายในชมรม' },
] as const;
export const CATEGORY_OPTIONS = [
  { value: 'competition', label: 'รางวัลการแข่งขัน' },
  { value: 'performance', label: 'การแสดง / นิทรรศการ' },
  { value: 'academic', label: 'ผลงานวิชาการ' },
  { value: 'community_service', label: 'กิจกรรมบริการสังคม' },
  { value: 'other', label: 'อื่น ๆ' },
] as const;
export type AchievementLevel = (typeof LEVEL_OPTIONS)[number]['value'];
export type AchievementCategory = (typeof CATEGORY_OPTIONS)[number]['value'];

export const LEVEL_LABELS = Object.fromEntries(LEVEL_OPTIONS.map((o) => [o.value, o.label])) as Record<AchievementLevel, string>;
export const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label])) as Record<AchievementCategory, string>;

export const STATUS_LABELS: Record<AchievementStatus, string> = {
  pending: 'รอรับรอง',
  approved: 'รับรองแล้ว',
  returned: 'ส่งกลับแก้ไข',
  rejected: 'ไม่รับรอง',
  withdrawn: 'ถอนแล้ว',
};

export const ACTION_LABELS: Record<AchievementAction, string> = {
  submitted: 'บันทึกผลงาน',
  updated: 'แก้ไขผลงาน',
  resubmitted: 'แก้ไขแล้วส่งใหม่',
  withdrawn: 'ถอนผลงาน',
  approved: 'รับรอง',
  returned: 'ส่งกลับแก้ไข',
  rejected: 'ไม่รับรอง',
};

export interface AchievementItem {
  id: string;
  clubId: string;
  clubName: string;
  userId: string;
  ownerName: string | null;
  ownerEmail: string;
  title: string;
  achievedOn: string;
  level: AchievementLevel;
  category: AchievementCategory;
  award: string | null;
  organizer: string | null;
  description: string | null;
  status: AchievementStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AchievementFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AchievementDetail extends AchievementItem {
  // มีเฉพาะผู้ที่ดูข้อมูลภายในได้ (เจ้าของ / กรรมการ / เจ้าหน้าที่)
  files?: AchievementFile[];
  events?: { action: AchievementAction; note: string | null; actorName: string | null; createdAt: string }[];
  me: { isOwner: boolean; canEdit: boolean; canReview: boolean };
}

export interface AchievementPage {
  items: AchievementItem[];
  total: number;
  page: number;
  pageSize: number;
}
