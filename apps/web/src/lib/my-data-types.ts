// รูปแบบข้อมูลจาก GET /me/data (ต้องตรงกับ apps/api/src/services/my-data-service.ts)
export interface MyData {
  generatedAt: string;
  controller: string;
  dpoContact: string;
  account: {
    email: string;
    name: string | null;
    pictureUrl: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    fontScale: string | null;
    roles: { code: string; nameTh: string }[];
  };
  staffProfile: {
    staffCode: string;
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
}
