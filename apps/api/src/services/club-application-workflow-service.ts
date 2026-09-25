import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  insertApplicationEvent,
  listAdvisorRows,
  listApplicationsByStatus,
  listApplicationsForAdvisor,
  lockApplication,
  markDecided,
  markReviewed,
  markSubmitted,
  recordAdvisorResponse,
  resetAdvisorConsents,
  updateApplicationStatus,
  verifyExternalAdvisorConsent,
  type AdvisorRequestItem,
  type ApplicationBase,
  type ApplicationStatus,
  type QueueItem,
} from '../repositories/club-applications-repository.js';
import {
  insertAdvisorsFromApplication,
  insertClubFromApplication,
  insertCommitteeFromApplication,
  insertMembershipsFromApplication,
} from '../repositories/clubs-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { collectSubmissionIssues, notFound } from './club-application-service.js';
import { isEligibleForClub } from './club-rules.js';
import { bangkokDateString, fiscalYearRange } from './fiscal-year.js';
import { PERMISSIONS, type PermissionCode } from './permissions.js';

// ---------- ตัวช่วย ----------

function assertStatus(app: ApplicationBase, allowed: readonly ApplicationStatus[]): void {
  if (!allowed.includes(app.status)) {
    throw new AppError(409, 'INVALID_STATUS', 'คำขออยู่ในสถานะที่ทำรายการนี้ไม่ได้');
  }
}

async function lockAsApplicant(client: DbClient, auth: AuthContext, applicationId: string): Promise<ApplicationBase> {
  const app = await lockApplication(applicationId, client);
  if (!app || app.applicantUserId !== auth.user.id) throw notFound();
  return app;
}

/**
 * ล็อกคำขอสำหรับเจ้าหน้าที่/นายกสโมสร: ต้องมี permission และต้องไม่ใช่ผู้ยื่นเอง (แยกหน้าที่ผู้ขอกับผู้อนุมัติ)
 */
async function lockAsOfficer(
  client: DbClient,
  auth: AuthContext,
  applicationId: string,
  permission: PermissionCode,
): Promise<ApplicationBase> {
  if (!hasPermission(auth, permission)) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดำเนินการนี้');
  }
  const app = await lockApplication(applicationId, client);
  if (!app) throw notFound();
  if (app.applicantUserId === auth.user.id) {
    throw new AppError(403, 'CANNOT_DECIDE_OWN_APPLICATION', 'ผู้ยื่นคำขอตรวจหรืออนุมัติคำขอของตนเองไม่ได้');
  }
  return app;
}

async function transition(
  client: DbClient,
  app: ApplicationBase,
  actorUserId: string | null,
  toStatus: ApplicationStatus,
  note: string | null,
): Promise<void> {
  await insertApplicationEvent(
    { applicationId: app.id, actorUserId, fromStatus: app.status, toStatus, note },
    client,
  );
}

async function assertReadyToSubmit(client: DbClient, applicationId: string): Promise<void> {
  const issues = await collectSubmissionIssues(applicationId, client);
  if (issues.length > 0) {
    throw new AppError(422, 'APPLICATION_INCOMPLETE', issues.map((issue) => issue.message).join(' / '));
  }
}

// ---------- ผู้ยื่น ----------

/**
 * ส่งคำขอให้ที่ปรึกษายินยอม (draft/returned → awaiting_consent)
 * คำขอต้องครบถ้วนก่อน และล้างผลการยินยอมเดิมทุกครั้ง เพราะเนื้อหาอาจถูกแก้ไขไปแล้ว
 */
export async function requestAdvisorConsent(auth: AuthContext, applicationId: string): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockAsApplicant(client, auth, applicationId);
    assertStatus(app, ['draft', 'returned']);
    await assertReadyToSubmit(client, applicationId);
    await resetAdvisorConsents(applicationId, client);
    await updateApplicationStatus(applicationId, 'awaiting_consent', client);
    await transition(client, app, auth.user.id, 'awaiting_consent', null);
  });
}

// ดึงคำขอกลับไปแก้ไข (awaiting_consent → draft)
export async function withdrawToDraft(auth: AuthContext, applicationId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockAsApplicant(client, auth, applicationId);
    assertStatus(app, ['awaiting_consent']);
    await updateApplicationStatus(applicationId, 'draft', client);
    await transition(client, app, auth.user.id, 'draft', note);
  });
}

// ยื่นคำขอต่อสโมสร (awaiting_consent → submitted) ที่ปรึกษาต้องยินยอมครบทุกคน
export async function submitApplication(auth: AuthContext, applicationId: string): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockAsApplicant(client, auth, applicationId);
    assertStatus(app, ['awaiting_consent']);
    const advisors = await listAdvisorRows(applicationId, client);
    if (advisors.length === 0 || advisors.some((advisor) => advisor.consentStatus !== 'accepted')) {
      throw new AppError(422, 'ADVISOR_CONSENT_PENDING', 'ที่ปรึกษายังยินยอมไม่ครบทุกคน');
    }
    await assertReadyToSubmit(client, applicationId);
    await markSubmitted(applicationId, client);
    await transition(client, app, auth.user.id, 'submitted', null);
  });
}

// ---------- ที่ปรึกษา ----------

/**
 * ที่ปรึกษาตอบรับ/ปฏิเสธ (ต้อง login ด้วย email ที่ถูกเสนอ)
 * ปฏิเสธ → คำขอกลับเป็นฉบับร่างให้ผู้ยื่นแก้ไข พร้อมเหตุผลใน log
 */
export async function respondAsAdvisor(
  auth: AuthContext,
  applicationId: string,
  decision: 'accept' | 'decline',
  note: string | null,
): Promise<void> {
  if (!isEligibleForClub(auth.user.email)) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะบัญชีบุคลากรเท่านั้นที่เป็นที่ปรึกษาได้');
  }
  await withTransaction(async (client) => {
    const app = await lockApplication(applicationId, client);
    if (!app) throw notFound();
    assertStatus(app, ['awaiting_consent']);

    const recorded = await recordAdvisorResponse(
      applicationId,
      auth.user.id,
      auth.user.email,
      decision === 'accept' ? 'accepted' : 'declined',
      client,
    );
    if (!recorded) {
      // ไม่ใช่ที่ปรึกษาของคำขอนี้ หรือตอบไปแล้ว
      throw new AppError(409, 'NO_PENDING_CONSENT', 'ไม่มีคำขอความยินยอมที่รอคุณตอบในคำขอนี้');
    }

    if (decision === 'decline') {
      await updateApplicationStatus(applicationId, 'draft', client);
      await transition(client, app, auth.user.id, 'draft', note ? `ที่ปรึกษาปฏิเสธ: ${note}` : 'ที่ปรึกษาปฏิเสธ');
    }
  });
}

export async function listMyAdvisorRequests(auth: AuthContext): Promise<AdvisorRequestItem[]> {
  return listApplicationsForAdvisor(auth.user.id, auth.user.email);
}

// ---------- เจ้าหน้าที่สโมสร (ขั้นที่ 1) ----------

export async function reviewApplication(
  auth: AuthContext,
  applicationId: string,
  decision: 'pass' | 'return',
  note: string | null,
): Promise<void> {
  if (decision === 'return' && !note) {
    throw new AppError(422, 'NOTE_REQUIRED', 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
  }
  await withTransaction(async (client) => {
    const app = await lockAsOfficer(client, auth, applicationId, PERMISSIONS.CLUB_APPLICATION_REVIEW);
    assertStatus(app, ['submitted']);
    if (decision === 'pass') {
      // ต้องตรวจใบคำยินยอมของที่ปรึกษาภายนอกครบทุกคนก่อน
      const advisors = await listAdvisorRows(applicationId, client);
      if (advisors.some((a) => a.externalPersonId && !a.consentVerifiedAt)) {
        throw new AppError(422, 'EXTERNAL_CONSENT_NOT_VERIFIED', 'กรุณาตรวจและยืนยันใบคำยินยอมของที่ปรึกษาภายนอกให้ครบก่อน');
      }
      await markReviewed(applicationId, auth.user.id, client);
      await transition(client, app, auth.user.id, 'reviewed', note);
    } else {
      await updateApplicationStatus(applicationId, 'returned', client);
      await transition(client, app, auth.user.id, 'returned', note);
    }
  });
}

/**
 * เจ้าหน้าที่ยืนยันว่าตรวจใบคำยินยอมของที่ปรึกษาภายนอก (ลำดับที่ sortOrder) แล้วถูกต้อง
 * ทำได้เฉพาะคำขอที่ยื่นแล้ว (submitted) ถ้าเอกสารไม่ถูกต้องให้ส่งกลับแก้ไขแทน
 */
export async function verifyAdvisorConsent(auth: AuthContext, applicationId: string, sortOrder: number): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockAsOfficer(client, auth, applicationId, PERMISSIONS.CLUB_APPLICATION_REVIEW);
    assertStatus(app, ['submitted']);
    if (!(await verifyExternalAdvisorConsent(applicationId, sortOrder, auth.user.id, client))) {
      throw new AppError(404, 'ADVISOR_NOT_FOUND', 'ไม่พบที่ปรึกษาภายนอกที่แนบใบคำยินยอมลำดับนี้');
    }
  });
}

// ---------- นายกสโมสร (ขั้นที่ 2) ----------

export interface DecisionResult {
  status: 'approved' | 'rejected' | 'returned';
  clubId: string | null;
}

/**
 * อนุมัติ / ไม่อนุมัติ / ส่งกลับแก้ไข (reviewed → ...)
 * อนุมัติ: สร้างชมรม + ที่ปรึกษา + กรรมการ + สมาชิกตั้งต้น ใน transaction เดียวกับการเปลี่ยนสถานะ
 * (สำเร็จทั้งหมด หรือไม่เกิดอะไรเลย)
 */
export async function decideApplication(
  auth: AuthContext,
  applicationId: string,
  decision: 'approve' | 'reject' | 'return',
  note: string | null,
): Promise<DecisionResult> {
  if (decision !== 'approve' && !note) {
    throw new AppError(422, 'NOTE_REQUIRED', 'กรุณาระบุเหตุผล');
  }
  return withTransaction(async (client) => {
    const app = await lockAsOfficer(client, auth, applicationId, PERMISSIONS.CLUB_APPLICATION_APPROVE);
    assertStatus(app, ['reviewed']);

    if (decision === 'return') {
      await updateApplicationStatus(applicationId, 'returned', client);
      await transition(client, app, auth.user.id, 'returned', note);
      return { status: 'returned', clubId: null };
    }
    if (decision === 'reject') {
      await markDecided(applicationId, 'rejected', auth.user.id, note, null, client);
      await transition(client, app, auth.user.id, 'rejected', note);
      return { status: 'rejected', clubId: null };
    }

    if (app.type !== 'establish') {
      throw new AppError(422, 'NOT_SUPPORTED', 'ยังไม่รองรับการอนุมัติคำขอประเภทนี้');
    }
    // ข้อมูลอาจเปลี่ยนระหว่างรออนุมัติ (เช่น สมาชิกถูกปิดบัญชี, มีชมรมชื่อซ้ำเกิดขึ้น) จึงตรวจซ้ำ
    await assertReadyToSubmit(client, applicationId);

    const today = bangkokDateString();
    let clubId: string;
    try {
      clubId = await insertClubFromApplication(applicationId, today, fiscalYearRange(app.fiscalYear).end, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'CLUB_NAME_TAKEN', 'มีชมรมที่ใช้ชื่อนี้อยู่แล้ว');
      }
      throw err;
    }
    await insertAdvisorsFromApplication(clubId, applicationId, app.fiscalYear, today, client);
    await insertCommitteeFromApplication(clubId, applicationId, today, client);
    await insertMembershipsFromApplication(clubId, applicationId, client);

    await markDecided(applicationId, 'approved', auth.user.id, note, clubId, client);
    await transition(client, app, auth.user.id, 'approved', note);
    return { status: 'approved', clubId };
  });
}

// ---------- กล่องงาน ----------

/**
 * รายการคำขอตามสถานะสำหรับเจ้าหน้าที่ ค่าตั้งต้นตามสิทธิ์:
 * ผู้ตรวจเห็น submitted, ผู้อนุมัติเห็น reviewed (มีทั้งสองสิทธิ์เห็นทั้งสองสถานะ)
 */
export async function listOfficerQueue(auth: AuthContext, statuses?: ApplicationStatus[]): Promise<QueueItem[]> {
  const canReview = hasPermission(auth, PERMISSIONS.CLUB_APPLICATION_REVIEW);
  const canApprove = hasPermission(auth, PERMISSIONS.CLUB_APPLICATION_APPROVE);
  const canReadAll = hasPermission(auth, PERMISSIONS.CLUB_READ_ALL) || hasPermission(auth, PERMISSIONS.CLUB_MANAGE_ALL);
  if (!canReview && !canApprove && !canReadAll) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูรายการคำขอ');
  }
  const defaults: ApplicationStatus[] = [
    ...(canReview || canReadAll ? (['submitted'] as const) : []),
    ...(canApprove || canReadAll ? (['reviewed'] as const) : []),
  ];
  return listApplicationsByStatus(statuses && statuses.length > 0 ? statuses : defaults, 100);
}
