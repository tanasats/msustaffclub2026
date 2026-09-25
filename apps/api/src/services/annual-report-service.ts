import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import { listActivities } from '../repositories/activities-repository.js';
import {
  acknowledgeAnnualReport,
  computeAnnualStats,
  findAnnualReportDetail,
  findAnnualReportRecord,
  insertAnnualReport,
  listAnnualReports,
  listReportOverview,
  lockAnnualReport,
  submitAnnualReport,
  updateAnnualReportText,
  type AnnualReportRecord,
} from '../repositories/annual-reports-repository.js';
import { findClubDetail } from '../repositories/clubs-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { bangkokDateString, fiscalYearOf, fiscalYearRange } from './fiscal-year.js';
import { PERMISSIONS } from './permissions.js';

function reportNotFound(): AppError {
  return new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงาน');
}

/**
 * กำหนดส่งรายงานประจำปี: ก่อนสิ้นวาระ (สิ้นปีงบประมาณ 30 ก.ย.) 30 วัน = 31 ส.ค.
 */
export function annualReportDueDate(fiscalYear: number): string {
  return `${fiscalYearRange(fiscalYear).end.slice(0, 4)}-08-31`;
}

// อ่านได้: ผู้มีสิทธิ์ชมรม club:view_internal หรือเจ้าหน้าที่ที่มี club_report:review (ไม่มีสิทธิ์ → 404)
async function loadReadable(auth: AuthContext, id: string): Promise<AnnualReportRecord> {
  const report = await findAnnualReportRecord(id);
  if (!report) throw reportNotFound();
  if (hasPermission(auth, PERMISSIONS.CLUB_REPORT_REVIEW)) return report;
  if (!(await hasClubPermission(auth, report.clubId, CLUB_PERMISSIONS.VIEW_INTERNAL))) throw reportNotFound();
  return report;
}

async function assertCanSubmit(auth: AuthContext, clubId: string): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.REPORT_SUBMIT))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดทำรายงานของชมรมนี้');
  }
}

// สถิติ + รายการกิจกรรมทั้งปีงบประมาณ จากข้อมูลปัจจุบัน
async function buildContent(clubId: string, fiscalYear: number, db?: DbClient) {
  const { start, end } = fiscalYearRange(fiscalYear);
  const [stats, activities] = await Promise.all([
    computeAnnualStats(clubId, fiscalYear, start, end, db),
    listActivities(clubId, start, end, 500, db),
  ]);
  return {
    stats,
    activities: activities
      .map((a) => ({ id: a.id, heldOn: a.heldOn, title: a.title, location: a.location, summary: a.summary, participantTotal: a.participantTotal }))
      .reverse(),
  };
}

// ---------- ผู้มีสิทธิ์ club_report:submit ----------

// สร้างร่างรายงานประจำปี (ปีงบประมาณปัจจุบันหรือปีที่แล้ว) ปีละ 1 ฉบับ
export async function createAnnualReport(auth: AuthContext, clubId: string, fiscalYear: number): Promise<string> {
  await assertCanSubmit(auth, clubId);
  const club = await findClubDetail(clubId);
  if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  const current = fiscalYearOf();
  if (fiscalYear !== current && fiscalYear !== current - 1) {
    throw new AppError(422, 'FISCAL_YEAR_OUT_OF_RANGE', 'จัดทำรายงานได้เฉพาะปีงบประมาณปัจจุบันหรือปีที่แล้ว');
  }
  if (club.establishedOn > fiscalYearRange(fiscalYear).end) {
    throw new AppError(422, 'YEAR_BEFORE_ESTABLISHED', 'ชมรมก่อตั้งหลังปีงบประมาณนี้');
  }
  try {
    return await withTransaction((client) => insertAnnualReport(clubId, fiscalYear, auth.user.id, client));
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new AppError(409, 'REPORT_EXISTS', 'มีรายงานประจำปีงบประมาณนี้อยู่แล้ว');
    }
    throw err;
  }
}

async function lockDraft(auth: AuthContext, id: string, client: DbClient): Promise<AnnualReportRecord> {
  const report = await lockAnnualReport(id, client);
  if (!report) throw reportNotFound();
  await assertCanSubmit(auth, report.clubId);
  if (report.status !== 'draft') {
    throw new AppError(409, 'REPORT_NOT_EDITABLE', 'รายงานนี้ส่งแล้ว แก้ไขไม่ได้');
  }
  return report;
}

export async function saveAnnualReport(auth: AuthContext, id: string, input: { summary: string | null; obstacles: string | null }): Promise<void> {
  await withTransaction(async (client) => {
    await lockDraft(auth, id, client);
    await updateAnnualReportText(id, input.summary, input.obstacles, client);
  });
}

// ส่งให้สโมสร: ต้องมีสรุปผลการดำเนินงาน และเก็บสถิติ/กิจกรรม ณ เวลาที่ส่ง
export async function submitAnnual(auth: AuthContext, id: string): Promise<void> {
  await withTransaction(async (client) => {
    const report = await lockDraft(auth, id, client);
    const detail = await findAnnualReportDetail(id, client);
    if (!detail?.summary) {
      throw new AppError(422, 'SUMMARY_REQUIRED', 'กรุณากรอกสรุปผลการดำเนินงานก่อนส่ง');
    }
    const { stats, activities } = await buildContent(report.clubId, report.fiscalYear, client);
    await submitAnnualReport(id, auth.user.id, stats, activities, client);
  });
}

// ---------- เจ้าหน้าที่สโมสร (club_report:review) ----------

export async function acknowledgeAnnual(auth: AuthContext, id: string, note: string | null): Promise<void> {
  if (!hasPermission(auth, PERMISSIONS.CLUB_REPORT_REVIEW)) {
    throw new AppError(403, 'FORBIDDEN', 'รับทราบรายงานประจำปีได้เฉพาะเจ้าหน้าที่สโมสร');
  }
  await withTransaction(async (client) => {
    const report = await lockAnnualReport(id, client);
    if (!report) throw reportNotFound();
    if (report.status !== 'submitted') {
      throw new AppError(409, 'INVALID_STATUS', 'รายงานนี้ไม่ได้อยู่ในสถานะรอรับทราบ');
    }
    await acknowledgeAnnualReport(id, auth.user.id, note, client);
  });
}

// ภาพรวมการส่งรายงานทุกชมรม — route ตรวจ club_report:review ด้วย requirePermission แล้ว
export async function getReportOverview(fiscalYear: number) {
  const { start, end } = fiscalYearRange(fiscalYear);
  return {
    fiscalYear,
    annualDueDate: annualReportDueDate(fiscalYear),
    items: await listReportOverview(fiscalYear, start, end, bangkokDateString()),
  };
}

// ---------- อ่าน ----------

// รายงานประจำปีของชมรม — route ตรวจ club:view_internal แล้ว
export async function getClubAnnualReports(clubId: string) {
  return { items: await listAnnualReports(clubId) };
}

/**
 * รายละเอียด: ร่างคำนวณสถิติ/กิจกรรมจากข้อมูลปัจจุบัน ส่งแล้วแสดงภาพนิ่ง
 */
export async function getAnnualReport(auth: AuthContext, id: string) {
  const record = await loadReadable(auth, id);
  const detail = await findAnnualReportDetail(id);
  if (!detail) throw reportNotFound();
  const { statsSnapshot, activitiesSnapshot, ...rest } = detail;
  const content =
    detail.status === 'draft'
      ? await buildContent(record.clubId, record.fiscalYear)
      : { stats: statsSnapshot, activities: activitiesSnapshot ?? [] };
  const [canSubmit, canViewClubReports] = await Promise.all([
    hasClubPermission(auth, record.clubId, CLUB_PERMISSIONS.REPORT_SUBMIT),
    hasClubPermission(auth, record.clubId, CLUB_PERMISSIONS.VIEW_INTERNAL),
  ]);
  return {
    ...rest,
    ...content,
    dueDate: annualReportDueDate(record.fiscalYear),
    me: {
      canEdit: detail.status === 'draft' && canSubmit,
      canAcknowledge: detail.status === 'submitted' && hasPermission(auth, PERMISSIONS.CLUB_REPORT_REVIEW),
      // เข้าหน้ารายงานภายในของชมรมได้หรือไม่ (เจ้าหน้าที่สโมสรที่ไม่ใช่คนในชมรม = ไม่ได้)
      canViewClubReports,
    },
  };
}
