import { AppError } from '../errors.js';
import * as repo from '../repositories/my-data-repository.js';
import type { AuthContext } from './authorization.js';

/**
 * ต้อง login เท่านั้น: ข้อมูลส่วนบุคคลทั้งหมดของผู้ใช้เอง (สิทธิขอเข้าถึง/รับสำเนา — PDPA มาตรา 30–31)
 * ใช้ทั้งหน้า "ข้อมูลของฉัน" และไฟล์ดาวน์โหลด (JSON) — คำร้องแก้ไข/ลบ/คัดค้าน ส่งต่อ DPO ของมหาวิทยาลัย
 */
export async function getMyData(auth: AuthContext) {
  const id = auth.user.id;
  const [
    account,
    staffProfile,
    studentProfile,
    privacyAcknowledgements,
    memberships,
    committeePositions,
    advisorships,
    applications,
    applicationRoles,
    achievements,
    activityParticipation,
    athleteRecords,
    competitionResults,
    selectionResults,
    uploadedFiles,
    emails,
    sessions,
  ] = await Promise.all([
    repo.getMyAccount(id),
    repo.getMyStaffProfile(id),
    repo.getMyStudentProfile(id),
    repo.listMyPrivacyAcknowledgements(id),
    repo.listMyMemberships(id),
    repo.listMyCommitteePositions(id),
    repo.listMyAdvisorships(id),
    repo.listMyApplications(id),
    repo.listMyApplicationRoles(id, auth.user.email),
    repo.listMyAchievements(id),
    repo.listMyActivityParticipation(id),
    repo.listMyAthleteRecords(id),
    repo.listMyCompetitionResults(id),
    repo.listMySelectionResults(id),
    repo.listMyUploadedFiles(id),
    repo.listMyEmails(id),
    repo.getMySessionSummary(id),
  ]);
  if (!account) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');

  return {
    generatedAt: new Date(),
    controller: 'มหาวิทยาลัยมหาสารคาม (ระบบบริหารจัดการชมรมบุคลากร)',
    dpoContact: 'dpo@msu.ac.th · 0-4371-9800 ต่อ 2344 · pdpa.msu.ac.th',
    account,
    staffProfile,
    studentProfile,
    privacyAcknowledgements,
    memberships,
    committeePositions,
    advisorships,
    applications,
    applicationRoles,
    achievements,
    activityParticipation,
    athleteRecords,
    competitionResults,
    selectionResults,
    uploadedFiles,
    emails,
    sessions,
  };
}
