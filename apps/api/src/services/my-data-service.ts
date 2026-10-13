import { AppError } from '../errors.js';
import * as repo from '../repositories/my-data-repository.js';
import type { AuthContext } from './authorization.js';

// จำนวนประวัติการเข้าระบบที่แสดง (เก็บจริง 180 วัน)
const LOGIN_EVENT_LIMIT = 50;

/**
 * ต้อง login เท่านั้น: ข้อมูลส่วนบุคคลทั้งหมดของผู้ใช้เอง (สิทธิขอเข้าถึง/รับสำเนา — PDPA มาตรา 30–31)
 * ใช้ทั้งหน้า "ข้อมูลของฉัน" และไฟล์ดาวน์โหลด (JSON) — คำร้องแก้ไข/ลบ/คัดค้าน ส่งต่อ DPO ของมหาวิทยาลัย
 */
export async function getMyData(auth: AuthContext) {
  return collectUserData(auth.user.id, auth.user.email);
}

/**
 * ผู้มีสิทธิ์ user_account:inspect (ไม่ผูก role → super_admin): ข้อมูลทั้งหมดของผู้ใช้คนหนึ่ง ชุดเดียวกับหน้า "ข้อมูลของฉัน"
 * ใช้ตรวจปัญหาบัญชี (ข้อมูลจาก Google/ERP การเข้าระบบ) — ตรวจสิทธิ์ที่ route แล้ว
 */
export async function getUserDataForAdmin(userId: string) {
  const account = await repo.getMyAccount(userId);
  if (!account) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
  return collectUserData(userId, account.email);
}

async function collectUserData(id: string, email: string) {
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
    loginEvents,
  ] = await Promise.all([
    repo.getMyAccount(id),
    repo.getMyStaffProfile(id),
    repo.getMyStudentProfile(id),
    repo.listMyPrivacyAcknowledgements(id),
    repo.listMyMemberships(id),
    repo.listMyCommitteePositions(id),
    repo.listMyAdvisorships(id),
    repo.listMyApplications(id),
    repo.listMyApplicationRoles(id, email),
    repo.listMyAchievements(id),
    repo.listMyActivityParticipation(id),
    repo.listMyAthleteRecords(id),
    repo.listMyCompetitionResults(id),
    repo.listMySelectionResults(id),
    repo.listMyUploadedFiles(id),
    repo.listMyEmails(id),
    repo.getMySessionSummary(id),
    repo.listMyLoginEvents(id, LOGIN_EVENT_LIMIT),
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
    loginEvents,
  };
}
