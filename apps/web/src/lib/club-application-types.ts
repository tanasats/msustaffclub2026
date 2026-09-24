// รูปแบบข้อมูลจาก API /club-applications (ต้องตรงกับ apps/api/src/services/club-application-service.ts)

export type ApplicationStatus =
  | 'draft'
  | 'awaiting_consent'
  | 'submitted'
  | 'returned'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'ฉบับร่าง',
  awaiting_consent: 'รอที่ปรึกษายินยอม',
  submitted: 'ยื่นแล้ว รอเจ้าหน้าที่ตรวจ',
  returned: 'ส่งกลับให้แก้ไข',
  reviewed: 'ตรวจผ่านแล้ว รอนายกสโมสรอนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิกแล้ว',
};

export const CONSENT_LABELS = { pending: 'รอตอบ', accepted: 'ยินยอมแล้ว', declined: 'ปฏิเสธ' } as const;

export interface PersonRef {
  id: string;
  name: string | null;
  email: string;
  orgUnitName: string | null;
}

export interface ApplicationDetail {
  id: string;
  type: 'establish' | 'renewal';
  status: ApplicationStatus;
  fiscalYear: number;
  clubId: string | null;
  applicant: { id: string; name: string | null; email: string };
  nameTh: string;
  category: { id: string; code: string; nameTh: string; requiresDetail: boolean } | null;
  categoryDetail: string | null;
  history: string | null;
  motto: string | null;
  logoMeaning: string | null;
  objectives: string[];
  officeLocation: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  regulationText: string | null;
  advisors: {
    email: string;
    user: { id: string; name: string | null } | null;
    sortOrder: number;
    consentStatus: 'pending' | 'accepted' | 'declined';
    respondedAt: string | null;
  }[];
  committee: {
    user: PersonRef;
    position: { code: string; nameTh: string };
    positionTitle: string;
    workLocation: string | null;
    contactPhone: string | null;
    bio: string | null;
  }[];
  members: PersonRef[];
  activities: { activityDate: string | null; activityTime: string | null; title: string; note: string | null }[];
  events: {
    actorUserId: string | null;
    actorName: string | null;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    note: string | null;
    createdAt: string;
  }[];
  submittedAt: string | null;
  decisionNote: string | null;
}

export interface ApplicationListItem {
  id: string;
  type: 'establish' | 'renewal';
  fiscalYear: number;
  status: ApplicationStatus;
  nameTh: string;
  updatedAt: string;
  applicantName?: string | null;
  myConsentStatus?: 'pending' | 'accepted' | 'declined';
  submittedAt?: string | null;
}

export interface ClubCategory {
  id: string;
  code: string;
  nameTh: string;
  requiresDetail: boolean;
}

export interface ClubPosition {
  id: string;
  code: string;
  nameTh: string;
  kind: 'committee' | 'advisor' | 'member';
  maxPerClub: number | null;
}

export interface ValidationIssue {
  code: string;
  message: string;
}
