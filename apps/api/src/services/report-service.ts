import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import { listActivities } from '../repositories/activities-repository.js';
import { findClubDetail } from '../repositories/clubs-repository.js';
import {
  acknowledgeMonthlyReport,
  findMonthlyReportDetail,
  findMonthlyReportRecord,
  insertMonthlyReport,
  listMeetings,
  listMonthlyReports,
  lockMonthlyReport,
  replaceMeetings,
  submitMonthlyReport,
  updateMonthlyReportSummary,
  type MeetingInput,
  type MonthlyReportRecord,
} from '../repositories/reports-repository.js';
import type { AuthContext } from './authorization.js';
import { getClubPermissions, hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS, type ClubPermissionCode } from './club-permissions.js';
import { bangkokDateString, fiscalYearOf } from './fiscal-year.js';

function reportNotFound(): AppError {
  return new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงาน');
}

// ช่วงของเดือน: วันที่ 1 และวันสุดท้าย (YYYY-MM-DD) จากค่า 'YYYY-MM'
export function monthRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

async function assertClubPermission(auth: AuthContext, clubId: string, permission: ClubPermissionCode, message: string): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, permission))) {
    throw new AppError(403, 'FORBIDDEN', message);
  }
}

/**
 * อ่านรายงานได้: ผู้มีสิทธิ์ชมรม club:view_internal (กรรมการ ที่ปรึกษา เจ้าหน้าที่ที่มี club:read_all)
 * ไม่มีสิทธิ์ → 404 (ไม่บอกว่ามีรายงานนี้)
 */
async function loadReadable(auth: AuthContext, reportId: string): Promise<MonthlyReportRecord> {
  const report = await findMonthlyReportRecord(reportId);
  if (!report || !(await hasClubPermission(auth, report.clubId, CLUB_PERMISSIONS.VIEW_INTERNAL))) throw reportNotFound();
  return report;
}

// ---------- ผู้มีสิทธิ์ club_report:submit (ประธาน / เลขานุการ) ----------

/**
 * สร้างร่างรายงานของเดือน (ไม่เกินเดือนปัจจุบัน และไม่ก่อนเดือนที่ก่อตั้งชมรม) 1 เดือน 1 รายงาน
 */
export async function createMonthlyReport(auth: AuthContext, clubId: string, month: string): Promise<string> {
  await assertClubPermission(auth, clubId, CLUB_PERMISSIONS.REPORT_SUBMIT, 'ไม่มีสิทธิ์จัดทำรายงานของชมรมนี้');
  const club = await findClubDetail(clubId);
  if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  const { start } = monthRange(month);
  if (start > bangkokDateString()) {
    throw new AppError(422, 'MONTH_IN_FUTURE', 'จัดทำรายงานล่วงหน้าไม่ได้');
  }
  if (start < `${club.establishedOn.slice(0, 7)}-01`) {
    throw new AppError(422, 'MONTH_BEFORE_ESTABLISHED', 'เดือนนี้อยู่ก่อนวันก่อตั้งชมรม');
  }
  try {
    return await withTransaction((client) =>
      insertMonthlyReport(clubId, start, fiscalYearOf(new Date(`${start}T00:00:00+07:00`)), auth.user.id, client),
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new AppError(409, 'REPORT_EXISTS', 'มีรายงานของเดือนนี้อยู่แล้ว');
    }
    throw err;
  }
}

// ล็อกรายงานที่ยังเป็นร่าง และตรวจว่าผู้ใช้มีสิทธิ์จัดทำรายงานของชมรมนั้น
async function lockDraft(auth: AuthContext, reportId: string, client: DbClient): Promise<MonthlyReportRecord> {
  const report = await lockMonthlyReport(reportId, client);
  if (!report) throw reportNotFound();
  await assertClubPermission(auth, report.clubId, CLUB_PERMISSIONS.REPORT_SUBMIT, 'ไม่มีสิทธิ์จัดทำรายงานของชมรมนี้');
  if (report.status !== 'draft') {
    throw new AppError(409, 'REPORT_NOT_EDITABLE', 'รายงานนี้ส่งแล้ว แก้ไขไม่ได้');
  }
  return report;
}

// บันทึกร่าง: สรุป + บันทึกการประชุม (วันที่ประชุมต้องอยู่ในเดือนของรายงาน)
export async function saveMonthlyReport(
  auth: AuthContext,
  reportId: string,
  input: { summary: string | null; meetings: MeetingInput[] },
): Promise<void> {
  await withTransaction(async (client) => {
    const report = await lockDraft(auth, reportId, client);
    const { start, end } = monthRange(report.reportMonth.slice(0, 7));
    if (input.meetings.some((m) => m.metOn < start || m.metOn > end)) {
      throw new AppError(422, 'MEETING_OUTSIDE_MONTH', 'วันที่ประชุมต้องอยู่ในเดือนของรายงาน');
    }
    await updateMonthlyReportSummary(reportId, input.summary, client);
    await replaceMeetings(reportId, input.meetings, client);
  });
}

// ส่งรายงานให้ที่ปรึกษา: เก็บภาพนิ่งของกิจกรรมในเดือน แล้วแก้ไขไม่ได้อีก
export async function submitReport(auth: AuthContext, reportId: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockDraft(auth, reportId, client);
    await submitMonthlyReport(reportId, auth.user.id, client);
  });
}

// ---------- ที่ปรึกษา (club_report:acknowledge) ----------

export async function acknowledgeReport(auth: AuthContext, reportId: string, note: string | null): Promise<void> {
  const record = await loadReadable(auth, reportId);
  await assertClubPermission(auth, record.clubId, CLUB_PERMISSIONS.REPORT_ACKNOWLEDGE, 'รับทราบรายงานได้เฉพาะที่ปรึกษาชมรม');
  await withTransaction(async (client) => {
    const report = await lockMonthlyReport(reportId, client);
    if (!report) throw reportNotFound();
    if (report.status !== 'submitted') {
      throw new AppError(409, 'INVALID_STATUS', 'รายงานนี้ไม่ได้อยู่ในสถานะรอรับทราบ');
    }
    await acknowledgeMonthlyReport(reportId, auth.user.id, note, client);
  });
}

// ---------- อ่าน ----------

// รายงานของชมรมในปีงบประมาณ — route ตรวจ club:view_internal ด้วย requireClubPermission แล้ว
export async function getMonthlyReports(clubId: string, fiscalYear: number) {
  return { fiscalYear, items: await listMonthlyReports(clubId, fiscalYear) };
}

/**
 * รายละเอียดรายงาน: ร่างแสดงกิจกรรมปัจจุบันของเดือน ส่งแล้วแสดงภาพนิ่ง ณ เวลาที่ส่ง
 */
export async function getMonthlyReport(auth: AuthContext, reportId: string) {
  const record = await loadReadable(auth, reportId);
  const [detail, meetings, permissions] = await Promise.all([
    findMonthlyReportDetail(reportId),
    listMeetings(reportId),
    getClubPermissions(auth, record.clubId),
  ]);
  if (!detail) throw reportNotFound();
  const { activitiesSnapshot, ...rest } = detail;
  let activities = activitiesSnapshot;
  if (detail.status === 'draft') {
    const { start, end } = monthRange(detail.reportMonth.slice(0, 7));
    activities = (await listActivities(detail.clubId, start, end, 200))
      .map((a) => ({ id: a.id, heldOn: a.heldOn, title: a.title, location: a.location, summary: a.summary, participantTotal: a.participantTotal }))
      .reverse();
  }
  const can = (code: ClubPermissionCode) => (permissions ?? []).includes(code);
  return {
    ...rest,
    activities: activities ?? [],
    meetings,
    me: {
      canEdit: detail.status === 'draft' && can(CLUB_PERMISSIONS.REPORT_SUBMIT),
      canAcknowledge: detail.status === 'submitted' && can(CLUB_PERMISSIONS.REPORT_ACKNOWLEDGE),
    },
  };
}
