// รูปแบบข้อมูลจาก GET /me/data (ต้องตรงกับ apps/api/src/services/my-data-service.ts)
export interface MyData {
  generatedAt: string;
  controller: string;
  dpoContact: string;
  account: {
    email: string;
    name: string | null;
    googleName: string | null;
    pictureUrl: string | null;
    hasLinkedGoogle: boolean;
    isActive: boolean;
    createdByName: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    fontScale: string | null;
    emailNotifications: boolean;
    roles: { code: string; nameTh: string }[];
  };
  staffProfile: {
    // erp = จาก ERP-HR, admin = ผู้ดูแลระบบบันทึกแทน (ไม่มีรหัสบุคลากร)
    source: 'erp' | 'admin';
    staffCode: string | null;
    prefixNameTh: string | null;
    firstNameTh: string | null;
    lastNameTh: string | null;
    prefixNameEn: string | null;
    firstNameEn: string | null;
    lastNameEn: string | null;
    positionNameTh: string | null;
    facultyName: string | null;
    departmentName: string | null;
    programName: string | null;
    erpFacultyId: string | null;
    erpDepartmentId: string | null;
    erpProgramId: string | null;
    orgUnitName: string | null;
    syncedAt: string;
  } | null;
  studentProfile: { studentCode: string; facultyName: string | null } | null;
  privacyAcknowledgements: { version: string; acknowledgedAt: string }[];
  memberships: { clubName: string; status: string; appliedAt: string; decidedAt: string | null; endedOn: string | null; endReason: string | null }[];
  committeePositions: { clubName: string; positionTitle: string; workLocation: string | null; contactPhone: string | null; bio: string | null; startedOn: string; endedOn: string | null }[];
  advisorships: { clubName: string; fiscalYear: number; startedOn: string; endedOn: string | null }[];
  applications: {
    nameTh: string;
    type: 'establish' | 'renewal';
    fiscalYear: number;
    status: string;
    createdAt: string;
    submittedAt: string | null;
    // ลบออกจากรายการแล้ว (ระบบยังเก็บไว้)
    deletedAt: string | null;
  }[];
  applicationRoles: { applicationName: string; role: 'advisor' | 'committee'; detail: string | null; contactPhone: string | null; workLocation: string | null; bio: string | null }[];
  achievements: { clubName: string; title: string; achievedOn: string; level: string; category: string; award: string | null; organizer: string | null; status: string }[];
  activityParticipation: { clubName: string; title: string; heldOn: string }[];
  athleteRecords: { clubName: string; sportName: string; eventOrPosition: string | null; since: string; endedAt: string | null }[];
  competitionResults: { title: string; eventName: string | null; sportName: string; heldFrom: string; rank: number | null; medal: string | null; stats: { name: string; value: number; unit: string | null }[] }[];
  selectionResults: { roundTitle: string; kind: string; fiscalYear: number; decision: string; reason: string; announcedAt: string }[];
  uploadedFiles: { originalName: string; purpose: string; sizeBytes: number; uploadedAt: string | null }[];
  emails: { subject: string; status: string; createdAt: string; sentAt: string | null }[];
  sessions: { active: number; lastSeenAt: string | null };
  // ประวัติการเข้าสู่ระบบ (เก็บ 180 วัน) ใหม่สุดก่อน
  loginEvents: { loggedInAt: string; erpResult: ErpResult | null }[];
}

export type ErpResult = 'ok' | 'not_found' | 'error';

// ผลการดึงข้อมูลบุคลากรจาก ERP ตอนเข้าสู่ระบบ (none = ไม่ได้ดึง เช่น บัญชีนิสิต)
export const ERP_RESULT_LABELS: Record<ErpResult | 'none', string> = {
  ok: 'ดึงข้อมูลจาก ERP สำเร็จ',
  not_found: 'ERP ไม่พบข้อมูลของบัญชีนี้ (เช่น ERP ไม่ได้บันทึกอีเมลนี้)',
  error: 'เรียก ERP ไม่สำเร็จ (ระบบ ERP ขัดข้อง) — ใช้ข้อมูลเดิม',
  none: 'ไม่ได้ดึงข้อมูลจาก ERP (บัญชีนิสิต)',
};
