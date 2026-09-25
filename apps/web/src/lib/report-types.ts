// รูปแบบข้อมูลจาก API รายงานรายเดือน (ต้องตรงกับ apps/api/src/services/report-service.ts)

export type MonthlyReportStatus = 'draft' | 'submitted' | 'acknowledged';

export const REPORT_STATUS_LABELS: Record<MonthlyReportStatus, string> = {
  draft: 'ร่าง',
  submitted: 'รอที่ปรึกษารับทราบ',
  acknowledged: 'ที่ปรึกษารับทราบแล้ว',
};

export interface MonthlyReportSummary {
  id: string;
  reportMonth: string;
  status: MonthlyReportStatus;
  submittedAt: string | null;
  acknowledgedAt: string | null;
}

export interface ReportMeeting {
  metOn: string;
  agenda: string;
  resolution: string | null;
  attendeeCount: number | null;
}

export interface MonthlyReportDetail {
  id: string;
  clubId: string;
  clubName: string;
  reportMonth: string;
  fiscalYear: number;
  status: MonthlyReportStatus;
  summary: string | null;
  activities: { id: string; heldOn: string; title: string; location: string | null; summary: string | null; participantTotal: number | null }[];
  meetings: (ReportMeeting & { id: string })[];
  createdByName: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
  me: { canEdit: boolean; canAcknowledge: boolean };
}

// ชื่อเดือนแบบไทย เช่น "กันยายน 2569" จาก 'YYYY-MM-DD'
export function thaiMonthLabel(date: string): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
