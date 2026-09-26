import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { insertApplicationEvent } from '../repositories/club-applications-repository.js';
import { listCurrentCommittee } from '../repositories/clubs-repository.js';
import {
  copyCurrentAdvisorsToApplication,
  countActiveMembers,
  findAnnualReportStatus,
  findClubRegistration,
  findRenewalApplication,
  insertRenewalFromClub,
  lockClubRegistration,
} from '../repositories/renewals-repository.js';
import type { AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { isEligibleForClub } from './club-rules.js';
import { bangkokDateString, fiscalYearOf } from './fiscal-year.js';

// กรรมการที่ดำรงตำแหน่งครบจำนวนปีงบประมาณนี้แล้ว → เตือนในคำขอต่อทะเบียน (ระเบียบข้อ 8: วาระสี่ปี) ไม่ตัดอัตโนมัติ
export const COMMITTEE_TERM_FISCAL_YEARS = 4;

export interface RenewalWindow {
  // ปีงบประมาณที่จะต่อทะเบียน (ปีถัดจากปีที่ทะเบียนปัจจุบันหมดอายุ)
  targetFiscalYear: number;
  opensOn: string;
  closesOn: string;
}

/**
 * ช่วงยื่นต่อทะเบียน: ตั้งแต่ 1 ก.ค. ของปีที่ทะเบียนหมดอายุ ถึงวันหมดอายุทะเบียน (ยืนยันแล้วในเอกสารออกแบบ หัวข้อ 12)
 */
export function renewalWindow(registeredUntil: string): RenewalWindow {
  return {
    targetFiscalYear: fiscalYearOf(new Date(`${registeredUntil}T12:00:00+07:00`)) + 1,
    opensOn: `${registeredUntil.slice(0, 4)}-07-01`,
    closesOn: registeredUntil,
  };
}

// จำนวนปีงบประมาณที่ดำรงตำแหน่ง (นับปีที่เริ่มด้วย) ณ วันนี้
export function fiscalYearsServed(startedOn: string, today: string = bangkokDateString()): number {
  const at = (date: string) => fiscalYearOf(new Date(`${date}T12:00:00+07:00`));
  return at(today) - at(startedOn) + 1;
}

/**
 * สถานะการต่อทะเบียนของชมรม (สำหรับหน้าชมรม) — route ตรวจ club:view_internal แล้ว
 */
export async function getRenewalStatus(auth: AuthContext, clubId: string) {
  const club = await findClubRegistration(clubId);
  if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  const today = bangkokDateString();
  const window = renewalWindow(club.registeredUntil);
  const [application, canSubmit] = await Promise.all([
    findRenewalApplication(clubId, window.targetFiscalYear),
    hasClubPermission(auth, clubId, CLUB_PERMISSIONS.REPORT_SUBMIT),
  ]);
  const isOpen = today >= window.opensOn && today <= window.closesOn;
  return {
    ...window,
    registeredUntil: club.registeredUntil,
    expired: today > club.registeredUntil,
    isOpen,
    application,
    canApply: canSubmit && isOpen && !application && club.status !== 'dissolved' && isEligibleForClub(auth.user.email),
  };
}

/**
 * ยื่นต่อทะเบียน (สร้างคำขอฉบับร่าง): ผู้มีสิทธิ์ชมรม club_report:submit (ประธาน/เลขานุการ) ในช่วงเวลาที่เปิด
 * คัดลอกข้อมูลชมรมและที่ปรึกษาชุดปัจจุบันให้ ผู้ยื่นแก้ไขแล้วส่งให้ที่ปรึกษายินยอมตาม flow เดิม
 */
export async function createRenewal(auth: AuthContext, clubId: string): Promise<string> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.REPORT_SUBMIT))) {
    throw new AppError(403, 'FORBIDDEN', 'ยื่นต่อทะเบียนได้เฉพาะประธานหรือเลขานุการชมรม');
  }
  if (!isEligibleForClub(auth.user.email)) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะบัญชีบุคลากรเท่านั้นที่ยื่นคำขอได้');
  }
  return withTransaction(async (client) => {
    const club = await lockClubRegistration(clubId, client);
    if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
    if (club.status === 'dissolved') throw new AppError(409, 'CLUB_DISSOLVED', 'ชมรมนี้ถูกยุบแล้ว');
    const window = renewalWindow(club.registeredUntil);
    const today = bangkokDateString();
    if (today < window.opensOn || today > window.closesOn) {
      throw new AppError(409, 'RENEWAL_NOT_OPEN', `ยื่นต่อทะเบียนได้ระหว่างวันที่ ${window.opensOn} ถึง ${window.closesOn}`);
    }
    if (await findRenewalApplication(clubId, window.targetFiscalYear, client)) {
      throw new AppError(409, 'RENEWAL_EXISTS', 'มีคำขอต่อทะเบียนของปีงบประมาณนี้อยู่แล้ว');
    }
    const applicationId = await insertRenewalFromClub(clubId, window.targetFiscalYear, auth.user.id, client);
    await copyCurrentAdvisorsToApplication(applicationId, clubId, client);
    await insertApplicationEvent({ applicationId, actorUserId: auth.user.id, fromStatus: null, toStatus: 'draft', note: null }, client);
    return applicationId;
  });
}

/**
 * ข้อมูลประกอบคำขอต่อทะเบียน (กรรมการ/สมาชิกปัจจุบันของชมรม และรายงานประจำปีของปีที่ผ่านมา)
 * กรรมการที่ดำรงตำแหน่งครบ 4 ปีงบประมาณ → termWarning = true
 */
export async function getRenewalContext(clubId: string, fiscalYear: number) {
  const [committee, activeMemberCount, annualReport, club] = await Promise.all([
    listCurrentCommittee(clubId),
    countActiveMembers(clubId),
    findAnnualReportStatus(clubId, fiscalYear - 1),
    findClubRegistration(clubId),
  ]);
  return {
    registeredUntil: club?.registeredUntil ?? null,
    activeMemberCount,
    previousAnnualReport: annualReport,
    committee: committee.map((c) => {
      const served = fiscalYearsServed(c.startedOn);
      return {
        userId: c.userId,
        name: c.name ?? c.email,
        positionTitle: c.positionTitle,
        startedOn: c.startedOn,
        fiscalYearsServed: served,
        termWarning: served >= COMMITTEE_TERM_FISCAL_YEARS,
      };
    }),
  };
}
