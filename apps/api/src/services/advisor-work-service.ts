import type { AuthContext } from './authorization.js';
import { getAdvisorSummary, listAdvisedClubs, listReportsToAcknowledge } from '../repositories/advisor-work-repository.js';
import { listApplicationsForAdvisor } from '../repositories/club-applications-repository.js';

// ต้อง login เท่านั้น: ข้อมูลของตัวผู้ใช้เอง (ไม่มีการระบุผู้ใช้อื่น) จึงไม่ต้องมี permission
export async function getMyAdvisorSummary(auth: AuthContext) {
  return getAdvisorSummary(auth.user.id, auth.user.email);
}

// กล่องงานที่ปรึกษา: คำขอที่เสนอชื่อฉัน, รายงานรอรับทราบ, ชมรมที่ฉันเป็นที่ปรึกษา
export async function getMyAdvisorWork(auth: AuthContext) {
  const [requests, reports, clubs] = await Promise.all([
    listApplicationsForAdvisor(auth.user.id, auth.user.email),
    listReportsToAcknowledge(auth.user.id),
    listAdvisedClubs(auth.user.id),
  ]);
  return { requests, reports, clubs };
}
