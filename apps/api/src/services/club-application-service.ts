import { pool, withTransaction, type DbClient, type Queryable } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  findApplicationBase,
  findApplicationDetail,
  insertApplication,
  ensureMemberRow,
  insertApplicationEvent,
  isClubNameTaken,
  isNominatedCommitteeMember,
  isProposedAdvisor,
  listActivityDetails,
  listAdvisorDetails,
  listAdvisorRows,
  listApplicationEvents,
  listApplicationsByApplicant,
  listCommitteeDetails,
  listMemberDetails,
  lockApplication,
  replaceActivityRows,
  replaceAdvisorRows,
  setAdvisorConsentFile,
  setPresidentConsentFile,
  findApplicationIdByConsentFile,
  replaceCommitteeRows,
  replaceMemberRows,
  restoreApplicationToDraft,
  softDeleteApplication,
  updateApplicationGeneral,
  updateApplicationStatus,
  type AdvisorRow,
  type ApplicationBase,
  type ApplicationGeneralFields,
  type ApplicationListItem,
} from '../repositories/club-applications-repository.js';
import {
  findActiveRegulationTemplate,
  findClubCategoryById,
  listClubPositions,
  type ClubPositionRecord,
} from '../repositories/club-master-repository.js';
import {
  findExternalPerson,
  insertExternalPerson,
  updateExternalPerson,
  type ExternalPersonInput,
} from '../repositories/external-persons-repository.js';
import { listCurrentCommittee } from '../repositories/clubs-repository.js';
import { findFile } from '../repositories/files-repository.js';
import { countActiveMembers, findAnnualReportStatus, findRenewalApplication } from '../repositories/renewals-repository.js';
import { findActiveUserIdsByEmail, findUserSummariesByIds, type UserSummary } from '../repositories/users-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import {
  clubFullName,
  CONSENT_ATTACHABLE_STATUSES,
  CANCELLABLE_APPLICATION_STATUSES,
  EDITABLE_APPLICATION_STATUSES,
  fillRegulationTemplate,
  isAllowedEmailDomain,
  isEligibleForClub,
  MAX_ADVISORS,
  MIN_INITIAL_MEMBERS,
  PRESIDENT_POSITION_CODE,
} from './club-rules.js';
import { buddhistYearOf, fiscalYearOf, toThaiDigits } from './fiscal-year.js';
import { registerFileReadAccess } from './files-service.js';
import { PERMISSIONS } from './permissions.js';
import { getRenewalContext } from './renewal-service.js';

// คำขอต่อทะเบียนใช้กรรมการ/สมาชิกจริงของชมรม (แก้ผ่านหน้าชมรม) จึงแก้ในคำขอไม่ได้
function assertEstablish(app: ApplicationBase): void {
  if (app.type !== 'establish') {
    throw new AppError(409, 'NOT_APPLICABLE_FOR_RENEWAL', 'คำขอต่อทะเบียนใช้กรรมการและสมาชิกปัจจุบันของชมรม แก้ไขได้ที่หน้าชมรม');
  }
}

export function notFound(): AppError {
  return new AppError(404, 'APPLICATION_NOT_FOUND', 'ไม่พบคำขอ');
}

// ---------- สิทธิ์เข้าถึงคำขอ ----------

/**
 * ผู้ที่ดูคำขอได้: ผู้ยื่น, ที่ปรึกษาที่ถูกเสนอ, ผู้ถูกเสนอเป็นประธาน (เมื่อถูกขอให้ตอบรับแล้ว),
 * ผู้มีสิทธิ์ตรวจ/อนุมัติ/ดูทั้งหมด/จัดการทั้งหมด
 * ตอบ 404 แทน 403 เมื่อไม่มีสิทธิ์ เพื่อไม่บอกว่ามีคำขอนี้อยู่
 */
export async function assertCanView(auth: AuthContext, app: ApplicationBase): Promise<void> {
  if (app.applicantUserId === auth.user.id) return;
  const staffPermissions = [
    PERMISSIONS.CLUB_APPLICATION_REVIEW,
    PERMISSIONS.CLUB_APPLICATION_APPROVE,
    PERMISSIONS.CLUB_READ_ALL,
    PERMISSIONS.CLUB_MANAGE_ALL,
  ];
  if (staffPermissions.some((permission) => hasPermission(auth, permission))) return;
  if (await isProposedAdvisor(app.id, auth.user.id, auth.user.email)) return;
  if (await isNominatedCommitteeMember(app.id, auth.user.id)) return;
  throw notFound();
}

// ผู้มีสิทธิ์ดูคำขอที่ผู้ยื่นลบแล้ว และกู้คืน (permission ไม่ผูก role → super_admin)
export function canManageDeleted(auth: AuthContext): boolean {
  return hasPermission(auth, PERMISSIONS.CLUB_APPLICATION_MANAGE_DELETED);
}

/**
 * อ่านคำขอสำหรับดู: คำขอที่ลบแล้วเห็นเฉพาะผู้มี club_application:manage_deleted (คนอื่นรวมผู้ยื่น → 404)
 * คำขอปกติตรวจด้วย assertCanView
 */
export async function findViewableApplication(auth: AuthContext, applicationId: string): Promise<ApplicationBase> {
  const base = await findApplicationBase(applicationId, pool, canManageDeleted(auth));
  if (!base) throw notFound();
  if (base.deletedAt === null) await assertCanView(auth, base);
  return base;
}

/**
 * ล็อกคำขอเพื่อแก้ไข: ต้องเป็นผู้ยื่น และคำขออยู่ในสถานะที่แก้ได้
 */
export async function lockForEdit(client: DbClient, auth: AuthContext, applicationId: string): Promise<ApplicationBase> {
  const app = await lockApplication(applicationId, client);
  if (!app || app.applicantUserId !== auth.user.id) {
    throw notFound();
  }
  if (!(EDITABLE_APPLICATION_STATUSES as readonly string[]).includes(app.status)) {
    throw new AppError(409, 'APPLICATION_NOT_EDITABLE', 'คำขอนี้อยู่ในสถานะที่แก้ไขไม่ได้');
  }
  return app;
}

// ---------- ตรวจผู้ใช้ที่ถูกเลือก ----------

/**
 * ผู้ใช้ทุกคนต้องมีในระบบ (เคย login), ยังใช้งานได้ และมีสิทธิ์เป็นสมาชิกชมรม (บุคลากร)
 */
async function loadEligibleUsers(userIds: string[], client: DbClient): Promise<Map<string, UserSummary>> {
  const unique = [...new Set(userIds)];
  const users = await findUserSummariesByIds(unique, client);
  const byId = new Map(users.map((user) => [user.id, user]));
  for (const id of unique) {
    const user = byId.get(id);
    if (!user) {
      throw new AppError(422, 'USER_NOT_FOUND', 'มีผู้ใช้ที่ไม่พบในระบบ (ต้องเคยเข้าสู่ระบบแล้ว)');
    }
    if (!user.isActive) {
      throw new AppError(422, 'USER_INACTIVE', `บัญชี ${user.email} ถูกปิดการใช้งาน`);
    }
    if (!isEligibleForClub(user.email)) {
      throw new AppError(422, 'USER_NOT_ELIGIBLE', `บัญชี ${user.email} ไม่ใช่บัญชีบุคลากร`);
    }
  }
  return byId;
}

// ---------- สร้างคำขอ ----------

export interface CreateDraftInput {
  nameTh: string;
  fiscalYear?: number;
}

/**
 * สร้างคำขอจัดตั้งชมรม (ฉบับร่าง) ใน transaction เดียว:
 * คำขอ + ระเบียบจากแม่แบบ + ผู้ยื่นเป็นประธาน + log การสร้าง
 */
export async function createEstablishDraft(auth: AuthContext, input: CreateDraftInput): Promise<string> {
  const currentFiscalYear = fiscalYearOf();
  const fiscalYear = input.fiscalYear ?? currentFiscalYear;
  // ยื่นได้สำหรับปีงบประมาณปัจจุบันหรือปีถัดไป (เผื่อยื่นล่วงหน้าช่วงปลายปีงบ)
  if (fiscalYear !== currentFiscalYear && fiscalYear !== currentFiscalYear + 1) {
    throw new AppError(422, 'INVALID_FISCAL_YEAR', 'ยื่นคำขอได้เฉพาะปีงบประมาณปัจจุบันหรือปีถัดไป');
  }
  if (!isEligibleForClub(auth.user.email)) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะบัญชีบุคลากรเท่านั้นที่ยื่นคำขอจัดตั้งชมรมได้');
  }

  return withTransaction(async (client) => {
    const template = await findActiveRegulationTemplate(client);
    const regulationText = template
      ? fillRegulationTemplate(template, { clubName: input.nameTh, year: toThaiDigits(buddhistYearOf()) })
      : null;

    const applicationId = await insertApplication(
      {
        type: 'establish',
        clubId: null,
        fiscalYear,
        applicantUserId: auth.user.id,
        nameTh: input.nameTh,
        regulationText,
      },
      client,
    );

    const president = (await listClubPositions(client)).find((p) => p.code === PRESIDENT_POSITION_CODE);
    if (!president) {
      throw new Error('ไม่พบตำแหน่งประธานในข้อมูลหลัก (ยังไม่ได้รัน migration หรือไม่)');
    }
    await replaceCommitteeRows(
      applicationId,
      [
        {
          userId: auth.user.id,
          positionId: president.id,
          positionTitle: president.nameTh,
          sortOrder: 1,
          workLocation: null,
          contactPhone: null,
          bio: null,
        },
      ],
      client,
    );

    await insertApplicationEvent(
      { applicationId, actorUserId: auth.user.id, fromStatus: null, toStatus: 'draft', note: null },
      client,
    );
    return applicationId;
  });
}

// ---------- แก้ข้อมูลทั่วไป ----------

export async function updateGeneral(
  auth: AuthContext,
  applicationId: string,
  fields: ApplicationGeneralFields,
): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockForEdit(client, auth, applicationId);

    if (fields.categoryId) {
      const category = await findClubCategoryById(fields.categoryId, client);
      if (!category) {
        throw new AppError(422, 'CATEGORY_NOT_FOUND', 'ไม่พบประเภทชมรมที่เลือก');
      }
    }

    // เปลี่ยนชื่อชมรม และไม่ได้ส่งระเบียบมาด้วย → แทนชื่อเดิมในระเบียบด้วยชื่อใหม่ให้อัตโนมัติ
    const next: ApplicationGeneralFields = { ...fields };
    if (fields.nameTh && fields.nameTh !== app.nameTh && fields.regulationText === undefined && app.regulationText) {
      next.regulationText = app.regulationText.replaceAll(clubFullName(app.nameTh), clubFullName(fields.nameTh));
    }
    await updateApplicationGeneral(applicationId, next, client);
  });
}

// ---------- ที่ปรึกษา ----------

export type AdvisorInput =
  | { userId: string }
  | { email: string }
  // บุคคลภายนอก: externalPersonId = คนเดิมในคำขอนี้ (แก้ข้อมูลได้), ไม่ระบุ = เพิ่มคนใหม่
  | { external: ExternalPersonInput; externalPersonId?: string };

// key สำหรับจับคู่ที่ปรึกษาคนเดิม เพื่อคงผลการยินยอม/ไฟล์แนบไว้เมื่อแก้รายชื่อ
const advisorKey = (row: Pick<AdvisorRow, 'email' | 'externalPersonId'>) =>
  row.externalPersonId ? `ext:${row.externalPersonId}` : `email:${row.email}`;

export async function replaceAdvisors(auth: AuthContext, applicationId: string, inputs: AdvisorInput[]): Promise<void> {
  if (inputs.length > MAX_ADVISORS) {
    throw new AppError(422, 'TOO_MANY_ADVISORS', `ที่ปรึกษาได้ไม่เกิน ${MAX_ADVISORS} คน`);
  }

  await withTransaction(async (client) => {
    const app = await lockForEdit(client, auth, applicationId);
    const previousRows = await listAdvisorRows(applicationId, client);
    const previousExternalIds = new Set(previousRows.flatMap((row) => (row.externalPersonId ? [row.externalPersonId] : [])));

    // แปลง input ทุกแบบให้เป็น (email, userId) หรือ (externalPersonId)
    const selectedIds = inputs.flatMap((input) => ('userId' in input ? [input.userId] : []));
    const users = await loadEligibleUsers(selectedIds, client);
    const resolved: Pick<AdvisorRow, 'email' | 'userId' | 'externalPersonId'>[] = [];
    for (const input of inputs) {
      if ('userId' in input) {
        resolved.push({ email: users.get(input.userId)!.email, userId: input.userId, externalPersonId: null });
      } else if ('email' in input) {
        const email = input.email.trim().toLowerCase();
        if (!isAllowedEmailDomain(email) || !isEligibleForClub(email)) {
          throw new AppError(422, 'ADVISOR_EMAIL_NOT_ALLOWED', `${email} ต้องเป็นบัญชีบุคลากรของมหาวิทยาลัย (บุคคลภายนอกให้เพิ่มแบบบุคคลภายนอก)`);
        }
        // ถ้ามีผู้ใช้ email นี้อยู่แล้ว (1 คนพอดี) ผูก user_id เลย ไม่เช่นนั้นรอจับคู่ตอนที่ปรึกษา login
        const matches = await findActiveUserIdsByEmail(email, client);
        resolved.push({ email, userId: matches.length === 1 ? matches[0]! : null, externalPersonId: null });
      } else if (input.externalPersonId) {
        // แก้ข้อมูลบุคคลภายนอกได้เฉพาะคนที่อยู่ในคำขอนี้อยู่แล้ว
        if (!previousExternalIds.has(input.externalPersonId) || !(await findExternalPerson(input.externalPersonId, client))) {
          throw new AppError(422, 'EXTERNAL_PERSON_NOT_FOUND', 'ไม่พบข้อมูลที่ปรึกษาภายนอก');
        }
        await updateExternalPerson(input.externalPersonId, input.external, client);
        resolved.push({ email: null, userId: null, externalPersonId: input.externalPersonId });
      } else {
        const id = await insertExternalPerson(input.external, auth.user.id, client);
        resolved.push({ email: null, userId: null, externalPersonId: id });
      }
    }

    const keys = resolved.map(advisorKey);
    if (new Set(keys).size !== keys.length) {
      throw new AppError(422, 'DUPLICATE_ADVISOR', 'ระบุที่ปรึกษาซ้ำกัน');
    }
    if (resolved.some((row) => row.email === auth.user.email || row.userId === app.applicantUserId)) {
      throw new AppError(422, 'ADVISOR_IS_APPLICANT', 'ผู้ยื่นคำขอเป็นที่ปรึกษาของชมรมตัวเองไม่ได้');
    }

    // คงผลการยินยอม/ไฟล์คำยินยอมเดิมไว้สำหรับที่ปรึกษาคนเดิม คนใหม่เริ่มที่ pending
    const previous = new Map(previousRows.map((row) => [advisorKey(row), row]));
    const rows: AdvisorRow[] = resolved.map((row, index) => {
      const old = previous.get(advisorKey(row));
      return {
        ...row,
        userId: row.userId ?? old?.userId ?? null,
        sortOrder: index + 1,
        consentStatus: old?.consentStatus ?? 'pending',
        respondedAt: old?.respondedAt ?? null,
        consentFileId: old?.consentFileId ?? null,
        consentVerifiedBy: old?.consentVerifiedBy ?? null,
        consentVerifiedAt: old?.consentVerifiedAt ?? null,
      };
    });
    await replaceAdvisorRows(applicationId, rows, client);
  });
}

// ไฟล์ต้องเป็นเอกสารคำยินยอมที่ผู้ยื่นอัปโหลดเองและอัปโหลดสำเร็จแล้ว (ใช้ purpose advisor_consent ร่วมกับใบตอบรับของประธาน)
async function assertConsentFile(auth: AuthContext, fileId: string, client: DbClient): Promise<void> {
  const file = await findFile(fileId, client);
  if (!file || file.uploadedBy !== auth.user.id || file.purpose !== 'advisor_consent' || file.status !== 'uploaded') {
    throw new AppError(422, 'INVALID_CONSENT_FILE', 'ไฟล์ใบคำยินยอมไม่ถูกต้อง หรือยังอัปโหลดไม่สำเร็จ');
  }
}

/**
 * ล็อกคำขอเพื่อแนบใบคำยินยอม/ใบตอบรับ: ต้องเป็นผู้ยื่น และคำขออยู่ในสถานะร่าง/ส่งกลับแก้ไข/รอการตอบรับ
 */
async function lockForConsentAttach(client: DbClient, auth: AuthContext, applicationId: string): Promise<ApplicationBase> {
  const app = await lockApplication(applicationId, client);
  if (!app || app.applicantUserId !== auth.user.id) {
    throw notFound();
  }
  if (!(CONSENT_ATTACHABLE_STATUSES as readonly string[]).includes(app.status)) {
    throw new AppError(409, 'APPLICATION_NOT_EDITABLE', 'คำขอนี้อยู่ในสถานะที่แนบเอกสารไม่ได้');
  }
  return app;
}

// ผู้ที่ยินยอม/ตอบรับผ่านระบบแล้ว ไม่ต้องแนบเอกสาร (แนบได้เมื่อยังไม่ตอบ หรือเปลี่ยนไฟล์ที่แนบไว้)
function assertConsentAttachable(consent: { consentStatus: string | null; consentFileId: string | null }): void {
  if (consent.consentStatus === 'accepted' && !consent.consentFileId) {
    throw new AppError(409, 'CONSENT_ALREADY_GIVEN', 'ผู้นี้ตอบรับผ่านระบบแล้ว ไม่ต้องแนบเอกสาร');
  }
}

/**
 * แนบใบคำยินยอมที่ลงนามแล้วให้ที่ปรึกษา (ลำดับที่ sortOrder) — บุคคลภายนอก หรือบุคลากรที่ไม่สะดวกเข้าระบบ
 * แนบแล้วถือว่ายินยอม (ไม่ต้องกดในระบบ) เจ้าหน้าที่ต้องยืนยันเอกสารก่อนตรวจผ่าน
 * ระหว่างรอการตอบรับ แนบได้เฉพาะผู้ที่ยังไม่ตอบในระบบ และบันทึกประวัติคำขอไว้เป็นหลักฐาน
 */
export async function attachExternalAdvisorConsent(
  auth: AuthContext,
  applicationId: string,
  sortOrder: number,
  fileId: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockForConsentAttach(client, auth, applicationId);
    await assertConsentFile(auth, fileId, client);
    const advisor = (await listAdvisorRows(applicationId, client)).find((a) => a.sortOrder === sortOrder);
    if (!advisor) {
      throw new AppError(404, 'ADVISOR_NOT_FOUND', 'ไม่พบที่ปรึกษาลำดับนี้');
    }
    if (app.status === 'awaiting_consent') assertConsentAttachable(advisor);
    await setAdvisorConsentFile(applicationId, sortOrder, fileId, client);
    if (app.status === 'awaiting_consent') {
      await insertApplicationEvent(
        {
          applicationId,
          actorUserId: auth.user.id,
          fromStatus: app.status,
          toStatus: app.status,
          note: `แนบใบคำยินยอมที่ลงนามแล้วของที่ปรึกษาลำดับที่ ${sortOrder}`,
        },
        client,
      );
    }
  });
}

/**
 * แนบใบตอบรับที่ลงนามแล้วของผู้ถูกเสนอเป็นประธานที่ไม่สะดวกเข้าระบบ (ประธานที่ไม่ใช่ผู้ยื่น)
 * แนบแล้วถือว่าตอบรับ เจ้าหน้าที่ต้องยืนยันเอกสารก่อนตรวจผ่าน
 */
export async function attachPresidentConsent(auth: AuthContext, applicationId: string, fileId: string): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockForConsentAttach(client, auth, applicationId);
    assertEstablish(app);
    await assertConsentFile(auth, fileId, client);
    const nominee = (await listCommitteeDetails(applicationId, client)).find(
      (c) => c.positionCode === PRESIDENT_POSITION_CODE && c.userId !== app.applicantUserId,
    );
    if (!nominee) {
      throw new AppError(404, 'PRESIDENT_NOMINEE_NOT_FOUND', 'คำขอนี้ไม่มีผู้ถูกเสนอเป็นประธาน (ผู้ยื่นเป็นประธานเองไม่ต้องแนบใบตอบรับ)');
    }
    if (app.status === 'awaiting_consent') assertConsentAttachable(nominee);
    await setPresidentConsentFile(applicationId, app.applicantUserId, PRESIDENT_POSITION_CODE, { fileId }, client);
    if (app.status === 'awaiting_consent') {
      await insertApplicationEvent(
        {
          applicationId,
          actorUserId: auth.user.id,
          fromStatus: app.status,
          toStatus: app.status,
          note: 'แนบใบตอบรับที่ลงนามแล้วของผู้ถูกเสนอเป็นประธาน',
        },
        client,
      );
    }
  });
}

// สิทธิ์ดาวน์โหลดใบคำยินยอม = สิทธิ์ดูคำขอที่ไฟล์นั้นแนบอยู่
registerFileReadAccess('advisor_consent', async (auth, file) => {
  const applicationId = await findApplicationIdByConsentFile(file.id);
  if (!applicationId) return false;
  try {
    await findViewableApplication(auth, applicationId);
    return true;
  } catch (err) {
    // ไม่มีสิทธิ์ดูคำขอ (404) = ไม่มีสิทธิ์ดาวน์โหลด, error อื่นโยนต่อ
    if (err instanceof AppError && err.status === 404) return false;
    throw err;
  }
});

// ---------- กรรมการ ----------

export interface CommitteeInput {
  userId: string;
  positionCode: string;
  positionTitle?: string | null;
  workLocation?: string | null;
  contactPhone?: string | null;
  bio?: string | null;
}

function checkPositionLimits(inputs: CommitteeInput[], positions: Map<string, ClubPositionRecord>): void {
  const counts = new Map<string, number>();
  for (const input of inputs) {
    const position = positions.get(input.positionCode);
    if (!position || position.kind !== 'committee') {
      throw new AppError(422, 'POSITION_NOT_FOUND', `ไม่พบตำแหน่งกรรมการ ${input.positionCode}`);
    }
    counts.set(position.code, (counts.get(position.code) ?? 0) + 1);
  }
  for (const [code, count] of counts) {
    const max = positions.get(code)!.maxPerClub;
    if (max !== null && count > max) {
      throw new AppError(422, 'POSITION_LIMIT_EXCEEDED', `ตำแหน่ง${positions.get(code)!.nameTh}มีได้ไม่เกิน ${max} คน`);
    }
  }
}

export async function replaceCommittee(auth: AuthContext, applicationId: string, inputs: CommitteeInput[]): Promise<void> {
  const userIds = inputs.map((input) => input.userId);
  if (new Set(userIds).size !== userIds.length) {
    throw new AppError(422, 'DUPLICATE_COMMITTEE_MEMBER', '1 คนดำรงตำแหน่งกรรมการได้ 1 ตำแหน่ง');
  }

  await withTransaction(async (client) => {
    const app = await lockForEdit(client, auth, applicationId);
    assertEstablish(app);
    const positions = new Map((await listClubPositions(client)).map((p) => [p.code, p]));
    checkPositionLimits(inputs, positions);

    // ต้องมีประธาน 1 คน (ผู้ยื่นเป็นเองหรือเสนอบุคลากรอื่นก็ได้ ผู้ถูกเสนอต้องตอบรับก่อนยื่น)
    const presidents = inputs.filter((input) => input.positionCode === PRESIDENT_POSITION_CODE);
    if (presidents.length !== 1) {
      throw new AppError(422, 'PRESIDENT_REQUIRED', 'กรุณาระบุประธานชมรม 1 คน');
    }

    await loadEligibleUsers(userIds, client);
    // ใบตอบรับที่แนบของประธานเดิม — คืนให้หลังบันทึกใหม่ถ้ายังเป็นประธานคนเดิม (แถวถูกสร้างใหม่ทั้งหมด)
    const previousPresident = (await listCommitteeDetails(applicationId, client)).find(
      (c) => c.positionCode === PRESIDENT_POSITION_CODE && c.consentFileId,
    );
    await replaceCommitteeRows(
      applicationId,
      inputs.map((input, index) => {
        const position = positions.get(input.positionCode)!;
        return {
          userId: input.userId,
          positionId: position.id,
          positionTitle: input.positionTitle?.trim() || position.nameTh,
          sortOrder: index + 1,
          workLocation: input.workLocation ?? null,
          contactPhone: input.contactPhone ?? null,
          bio: input.bio ?? null,
        };
      }),
      client,
    );
    if (previousPresident && presidents[0]!.userId === previousPresident.userId) {
      await setPresidentConsentFile(
        applicationId,
        app.applicantUserId,
        PRESIDENT_POSITION_CODE,
        {
          fileId: previousPresident.consentFileId!,
          respondedAt: previousPresident.respondedAt ?? undefined,
          verifiedBy: previousPresident.consentVerifiedBy,
          verifiedAt: previousPresident.consentVerifiedAt,
        },
        client,
      );
    }
    // ผู้ยื่นที่ไม่ได้เป็นกรรมการ ต้องเป็นสมาชิกตั้งต้นของชมรม
    if (!userIds.includes(app.applicantUserId)) {
      await ensureMemberRow(applicationId, app.applicantUserId, client);
    }
  });
}

// ---------- สมาชิก ----------

export async function replaceMembers(auth: AuthContext, applicationId: string, userIds: string[]): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockForEdit(client, auth, applicationId);
    assertEstablish(app);
    // ผู้ยื่นที่ไม่ได้เป็นกรรมการ ต้องอยู่ในรายชื่อสมาชิกตั้งต้นเสมอ (เพิ่มให้อัตโนมัติ)
    const committee = await listCommitteeDetails(applicationId, client);
    const ids = committee.some((c) => c.userId === app.applicantUserId) ? userIds : [app.applicantUserId, ...userIds];
    const unique = [...new Set(ids)];
    await loadEligibleUsers(unique, client);
    await replaceMemberRows(applicationId, unique, client);
  });
}

// ---------- แผนกิจกรรม ----------

export interface ActivityInput {
  activityDate?: string | null;
  activityTime?: string | null;
  title: string;
  note?: string | null;
}

export async function replaceActivities(auth: AuthContext, applicationId: string, inputs: ActivityInput[]): Promise<void> {
  await withTransaction(async (client) => {
    await lockForEdit(client, auth, applicationId);
    await replaceActivityRows(
      applicationId,
      inputs.map((input, index) => ({
        activityDate: input.activityDate ?? null,
        activityTime: input.activityTime ?? null,
        title: input.title,
        note: input.note ?? null,
        sortOrder: index + 1,
      })),
      client,
    );
  });
}

// ---------- ยกเลิก ----------

export async function cancelApplication(auth: AuthContext, applicationId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockApplication(applicationId, client);
    if (!app || app.applicantUserId !== auth.user.id) throw notFound();
    if (!(CANCELLABLE_APPLICATION_STATUSES as readonly string[]).includes(app.status)) {
      throw new AppError(409, 'APPLICATION_NOT_CANCELLABLE', 'คำขอนี้อยู่ในสถานะที่ยกเลิกไม่ได้');
    }
    await updateApplicationStatus(applicationId, 'cancelled', client);
    await insertApplicationEvent(
      { applicationId, actorUserId: auth.user.id, fromStatus: app.status, toStatus: 'cancelled', note },
      client,
    );
  });
}

// ---------- ลบ / กู้คืน ----------

/**
 * ผู้ยื่นลบคำขอที่ยกเลิกแล้วออกจากรายการ (ทั้งจัดตั้งและต่อทะเบียน)
 * ไม่ลบข้อมูลจริง: ตั้ง deleted_at/deleted_by (ไฟล์แนบเก็บไว้เพราะกู้คืนได้) และบันทึก log ใน transaction เดียวกัน
 */
export async function deleteApplication(auth: AuthContext, applicationId: string): Promise<void> {
  await withTransaction(async (client) => {
    const app = await lockApplication(applicationId, client);
    if (!app || app.applicantUserId !== auth.user.id) throw notFound();
    if (app.status !== 'cancelled' || !(await softDeleteApplication(applicationId, auth.user.id, client))) {
      throw new AppError(409, 'APPLICATION_NOT_DELETABLE', 'ลบได้เฉพาะคำขอที่ยกเลิกแล้ว');
    }
    await insertApplicationEvent(
      { applicationId, actorUserId: auth.user.id, fromStatus: 'cancelled', toStatus: 'cancelled', note: 'ผู้ยื่นลบคำขอออกจากรายการ' },
      client,
    );
  });
}

/**
 * ผู้ดูแลระบบกู้คืนคำขอที่ยกเลิกแล้ว (ลบแล้วหรือยังไม่ลบ) เป็นฉบับร่าง ต้องระบุเหตุผล
 * - ผู้ยื่นต้องยังใช้งานได้และเป็นบุคลากร (ไม่เช่นนั้นไม่มีใครแก้ไขต่อได้)
 * - คำขอต่อทะเบียน: ชมรมต้องยังไม่มีคำขอต่อทะเบียนปีเดียวกันที่ดำเนินการอยู่/อนุมัติแล้ว (ปีละ 1 คำขอ)
 * การยินยอม/ตอบรับเดิมไม่ต้องล้างที่นี่ เพราะถูกล้างทุกครั้งที่ผู้ยื่นกดส่งขอการตอบรับ
 */
export async function restoreApplication(auth: AuthContext, applicationId: string, note: string): Promise<void> {
  if (!canManageDeleted(auth)) throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดำเนินการนี้');
  await withTransaction(async (client) => {
    const app = await lockApplication(applicationId, client, true);
    if (!app) throw notFound();
    if (app.status !== 'cancelled') {
      throw new AppError(409, 'APPLICATION_NOT_RESTORABLE', 'กู้คืนได้เฉพาะคำขอที่ยกเลิกหรือลบแล้ว');
    }
    const [applicant] = await findUserSummariesByIds([app.applicantUserId], client);
    if (!applicant || !applicant.isActive || !isEligibleForClub(applicant.email)) {
      throw new AppError(422, 'APPLICANT_UNAVAILABLE', 'ผู้ยื่นคำขอไม่ได้เป็นบุคลากรที่ใช้งานระบบได้แล้ว จึงกู้คืนไม่ได้');
    }
    if (app.type === 'renewal' && app.clubId && (await findRenewalApplication(app.clubId, app.fiscalYear, client))) {
      throw new AppError(409, 'RENEWAL_EXISTS', 'ชมรมนี้มีคำขอต่อทะเบียนปีงบประมาณเดียวกันอยู่แล้ว');
    }
    await restoreApplicationToDraft(applicationId, client);
    await insertApplicationEvent(
      {
        applicationId,
        actorUserId: auth.user.id,
        fromStatus: 'cancelled',
        toStatus: 'draft',
        note: `กู้คืนเป็นฉบับร่างโดยผู้ดูแลระบบ: ${note}`,
      },
      client,
    );
  });
}

// ---------- อ่าน ----------

export async function listMyApplications(auth: AuthContext): Promise<ApplicationListItem[]> {
  return listApplicationsByApplicant(auth.user.id);
}

export async function getApplicationDetail(auth: AuthContext, applicationId: string) {
  const base = await findViewableApplication(auth, applicationId);
  const includeDeleted = base.deletedAt !== null;

  const [detail, advisors, committee, members, activities, events] = await Promise.all([
    findApplicationDetail(applicationId, pool, includeDeleted),
    listAdvisorDetails(applicationId),
    listCommitteeDetails(applicationId),
    listMemberDetails(applicationId),
    listActivityDetails(applicationId),
    listApplicationEvents(applicationId),
  ]);
  if (!detail) throw notFound();
  // คำขอต่อทะเบียน: กรรมการ/สมาชิกปัจจุบันของชมรม และรายงานประจำปีของปีที่ผ่านมา
  const renewal = detail.type === 'renewal' && detail.clubId ? await getRenewalContext(detail.clubId, detail.fiscalYear) : null;

  return {
    id: detail.id,
    type: detail.type,
    status: detail.status,
    fiscalYear: detail.fiscalYear,
    clubId: detail.clubId,
    renewal,
    applicant: { id: detail.applicantUserId, name: detail.applicantName, email: detail.applicantEmail },
    nameTh: detail.nameTh,
    category: detail.categoryId
      ? {
          id: detail.categoryId,
          code: detail.categoryCode,
          nameTh: detail.categoryNameTh,
          requiresDetail: detail.categoryRequiresDetail,
        }
      : null,
    categoryDetail: detail.categoryDetail,
    history: detail.history,
    motto: detail.motto,
    logoMeaning: detail.logoMeaning,
    logoFileId: detail.logoFileId,
    objectives: detail.objectives,
    officeLocation: detail.officeLocation,
    contactPhone: detail.contactPhone,
    contactEmail: detail.contactEmail,
    regulationText: detail.regulationText,
    advisors: advisors.map((a) => ({
      kind: a.externalPersonId ? ('external' as const) : ('internal' as const),
      email: a.email,
      user: a.userId ? { id: a.userId, name: a.userName } : null,
      external: a.externalPersonId && a.external ? { id: a.externalPersonId, ...a.external } : null,
      sortOrder: a.sortOrder,
      consentStatus: a.consentStatus,
      respondedAt: a.respondedAt,
      consentFile: a.consentFileId ? { id: a.consentFileId, originalName: a.consentFileName } : null,
      consentVerified: a.consentVerifiedAt ? { at: a.consentVerifiedAt, byName: a.consentVerifiedByName } : null,
    })),
    committee: committee.map((c) => ({
      user: { id: c.userId, name: c.userName, email: c.userEmail, orgUnitName: c.orgUnitName },
      position: { code: c.positionCode, nameTh: c.positionNameTh },
      positionTitle: c.positionTitle,
      workLocation: c.workLocation,
      contactPhone: c.contactPhone,
      bio: c.bio,
      consentStatus: c.consentStatus,
      respondedAt: c.respondedAt,
      // ใบตอบรับที่ลงนามแล้ว (ผู้ถูกเสนอเป็นประธานที่ไม่สะดวกเข้าระบบ)
      consentFile: c.consentFileId ? { id: c.consentFileId, originalName: c.consentFileName } : null,
      consentVerified: c.consentVerifiedAt ? { at: c.consentVerifiedAt, byName: c.consentVerifiedByName } : null,
    })),
    members: members.map((m) => ({ id: m.userId, name: m.userName, email: m.userEmail, orgUnitName: m.orgUnitName })),
    activities,
    events,
    submittedAt: detail.submittedAt,
    reviewedAt: detail.reviewedAt,
    decidedAt: detail.decidedAt,
    decisionNote: detail.decisionNote,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    // ลบออกจากรายการแล้ว (เห็นเฉพาะผู้มีสิทธิ์ดูคำขอที่ลบ)
    deleted: detail.deletedAt ? { at: detail.deletedAt, byName: detail.deletedByName } : null,
  };
}

// ---------- ตรวจความครบถ้วนก่อนยื่น ----------

export interface ValidationIssue {
  code: string;
  message: string;
}

/**
 * รายการสิ่งที่ยังขาดก่อนยื่นคำขอ (ว่าง = พร้อมยื่น) ไม่ตรวจการยินยอมของที่ปรึกษา (ตรวจแยกตอนยื่น)
 */
export async function validateForSubmission(auth: AuthContext, applicationId: string): Promise<ValidationIssue[]> {
  const base = await findApplicationBase(applicationId);
  if (!base) throw notFound();
  await assertCanView(auth, base);
  return collectSubmissionIssues(applicationId);
}

/**
 * ตรวจความครบถ้วนของคำขอ (ใช้ทั้งตอนแสดงผล ตอนยื่น และตอนอนุมัติ)
 * ส่ง client มาเมื่อต้องการอ่านภายใน transaction เดียวกับการเปลี่ยนสถานะ
 */
export async function collectSubmissionIssues(applicationId: string, db: Queryable = pool): Promise<ValidationIssue[]> {
  // อ่านทีละคำสั่ง (client ใน transaction รัน query พร้อมกันไม่ได้)
  const detail = await findApplicationDetail(applicationId, db);
  const advisors = await listAdvisorDetails(applicationId, db);
  const committee = await listCommitteeDetails(applicationId, db);
  const members = await listMemberDetails(applicationId, db);
  if (!detail) throw notFound();

  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  if (await isClubNameTaken(detail.nameTh, detail.type === 'renewal' ? detail.clubId : null, db)) {
    add('CLUB_NAME_TAKEN', 'มีชมรมที่ใช้ชื่อนี้อยู่แล้ว');
  }
  if (!detail.categoryId) {
    add('CATEGORY_REQUIRED', 'กรุณาเลือกประเภทชมรม');
  } else if (detail.categoryRequiresDetail && !detail.categoryDetail?.trim()) {
    add('CATEGORY_DETAIL_REQUIRED', 'กรุณาระบุรายละเอียดประเภทชมรม');
  }
  if (detail.objectives.filter((objective) => objective.trim()).length === 0) {
    add('OBJECTIVES_REQUIRED', 'กรุณาระบุวัตถุประสงค์อย่างน้อย 1 ข้อ');
  }
  // คำขอจัดตั้งต้องมีประวัติชมรม (คำขอต่อทะเบียนใช้ประวัติเดิมของชมรม จึงไม่บังคับ)
  if (detail.type === 'establish' && !detail.history?.trim()) {
    add('HISTORY_REQUIRED', 'กรุณากรอกประวัติชมรม');
  }
  if (!detail.regulationText?.trim()) {
    add('REGULATION_REQUIRED', 'กรุณากรอกระเบียบข้อบังคับของชมรม');
  }
  if (advisors.length === 0) {
    add('ADVISOR_REQUIRED', 'กรุณาระบุที่ปรึกษาชมรมอย่างน้อย 1 คน');
  } else if (!advisors.some((a) => !a.externalPersonId)) {
    add('INTERNAL_ADVISOR_REQUIRED', 'ต้องมีที่ปรึกษาที่เป็นบุคลากรของมหาวิทยาลัยอย่างน้อย 1 คน');
  }
  const missingConsent = advisors.filter((a) => a.externalPersonId && !a.consentFileId);
  if (missingConsent.length > 0) {
    add('EXTERNAL_CONSENT_REQUIRED', 'กรุณาแนบใบคำยินยอมที่ลงนามแล้วของที่ปรึกษาภายนอกให้ครบ');
  }
  if (detail.type === 'renewal' && detail.clubId) {
    await addRenewalIssues(detail.clubId, detail.fiscalYear, advisors, add, db);
    return issues;
  }
  const committeeUserIds = new Set(committee.map((c) => c.userId));
  if (advisors.some((a) => a.userId && committeeUserIds.has(a.userId))) {
    add('ADVISOR_IN_COMMITTEE', 'ที่ปรึกษาต้องไม่เป็นกรรมการของชมรม');
  }
  const presidents = committee.filter((c) => c.positionCode === PRESIDENT_POSITION_CODE);
  if (presidents.length !== 1) {
    add('PRESIDENT_REQUIRED', 'กรุณาระบุประธานชมรม 1 คน');
  }
  // ผู้ยื่นต้องร่วมก่อตั้ง: เป็นกรรมการหรือสมาชิกตั้งต้น
  if (![...committee, ...members].some((person) => person.userId === detail.applicantUserId)) {
    add('APPLICANT_MUST_BE_FOUNDER', 'ผู้ยื่นคำขอต้องเป็นกรรมการหรือสมาชิกตั้งต้นของชมรม');
  }
  // สมาชิกตั้งต้น = กรรมการ ∪ สมาชิกที่ระบุ (นับเฉพาะบัญชีที่ยังใช้งานได้)
  const inactive = [...committee, ...members].filter((person) => !person.userIsActive);
  if (inactive.length > 0) {
    add('INACTIVE_USERS', `มีบัญชีที่ถูกปิดการใช้งาน: ${[...new Set(inactive.map((p) => p.userEmail))].join(', ')}`);
  }
  const activeMembers = new Set(
    [...committee, ...members].filter((person) => person.userIsActive).map((person) => person.userId),
  );
  if (activeMembers.size < MIN_INITIAL_MEMBERS) {
    add('MIN_MEMBERS', `ต้องมีสมาชิกตั้งต้นอย่างน้อย ${MIN_INITIAL_MEMBERS} คน (นับรวมกรรมการ) ตอนนี้มี ${activeMembers.size} คน`);
  }
  return issues;
}

/**
 * เงื่อนไขเพิ่มของคำขอต่อทะเบียน: กรรมการ/สมาชิกใช้ข้อมูลจริงของชมรม (ไม่ได้กรอกในคำขอ)
 * - สมาชิก active ของชมรม ≥ MIN_INITIAL_MEMBERS
 * - ส่งรายงานประจำปีของปีงบประมาณที่ผ่านมาแล้ว (ส่งแล้วหรือสโมสรรับทราบแล้ว)
 * - ที่ปรึกษาที่เสนอต้องไม่เป็นกรรมการชุดปัจจุบัน
 */
async function addRenewalIssues(
  clubId: string,
  fiscalYear: number,
  advisors: { userId: string | null }[],
  add: (code: string, message: string) => void,
  db: Queryable,
): Promise<void> {
  const committee = await listCurrentCommittee(clubId, db);
  const committeeUserIds = new Set(committee.map((c) => c.userId));
  if (advisors.some((a) => a.userId && committeeUserIds.has(a.userId))) {
    add('ADVISOR_IN_COMMITTEE', 'ที่ปรึกษาต้องไม่เป็นกรรมการของชมรม');
  }
  const activeMembers = await countActiveMembers(clubId, db);
  if (activeMembers < MIN_INITIAL_MEMBERS) {
    add('MIN_MEMBERS', `ชมรมต้องมีสมาชิกอย่างน้อย ${MIN_INITIAL_MEMBERS} คน ตอนนี้มี ${activeMembers} คน`);
  }
  const annual = await findAnnualReportStatus(clubId, fiscalYear - 1, db);
  if (!annual || annual.status === 'draft') {
    add('ANNUAL_REPORT_REQUIRED', `กรุณาส่งรายงานประจำปีงบประมาณ ${fiscalYear - 1} ให้สโมสรก่อนยื่นต่อทะเบียน`);
  }
}
