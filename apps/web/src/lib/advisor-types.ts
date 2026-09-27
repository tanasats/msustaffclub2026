// รูปแบบข้อมูลจาก GET /me/advisor-work (ต้องตรงกับ apps/api/src/services/advisor-work-service.ts)
import type { ApplicationListItem } from './club-application-types';

export interface AdvisorWork {
  requests: ApplicationListItem[];
  reports: { id: string; clubId: string; clubName: string; reportMonth: string; submittedAt: string; submittedByName: string | null }[];
  clubs: { id: string; nameTh: string; logoFileId: string | null; startedOn: string; reportsToAcknowledge: number }[];
}
