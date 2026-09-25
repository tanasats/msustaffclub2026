import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  findActivityByFileId,
  findActivityDetail,
  findActivityRecord,
  findNonMembers,
  insertActivity,
  insertPlannedActivity,
  listActivities,
  listActivityFileIds,
  listActivityPhotos,
  listParticipants,
  listPlannedActivities,
  lockActivity,
  plannedActivityBelongsToClub,
  replaceActivityFiles,
  replaceParticipants,
  softDeleteActivity,
  softDeletePlannedActivity,
  updateActivity,
  updatePlannedActivity,
  type ActivityFields,
  type PlannedActivityFields,
} from '../repositories/activities-repository.js';
import { findCurrentMembershipStatus } from '../repositories/clubs-repository.js';
import { lockClubStatus } from '../repositories/memberships-repository.js';
import type { AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { bangkokDateString, fiscalYearOf, fiscalYearRange } from './fiscal-year.js';
import { assertAttachableFile, discardFileIfUnused, registerFileReadAccess } from './files-service.js';

export const MAX_ACTIVITY_PHOTOS = 10;

export interface ActivityInput extends ActivityFields {
  participantUserIds: string[];
  photoFileIds: string[];
}

function activityNotFound(): AppError {
  return new AppError(404, 'ACTIVITY_NOT_FOUND', 'ไม่พบกิจกรรม');
}

// ---------- สิทธิ์ ----------

async function assertCanManage(auth: AuthContext, clubId: string): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.ACTIVITY_MANAGE))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการกิจกรรมของชมรมนี้');
  }
}

/**
 * รายชื่อผู้เข้าร่วมและรูปกิจกรรม (ข้อมูลส่วนบุคคล) เห็นเฉพาะสมาชิก active ของชมรม และผู้มี club:view_internal
 * ส่วนชื่อ/วันที่/สถานที่/สรุป/จำนวนผู้เข้าร่วม ทุกคนที่ login เห็นได้
 */
async function canSeeInternal(auth: AuthContext, clubId: string): Promise<boolean> {
  if (await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.VIEW_INTERNAL)) return true;
  return (await findCurrentMembershipStatus(clubId, auth.user.id)) === 'active';
}

registerFileReadAccess('activity_photo', async (auth, file) => {
  const activity = await findActivityByFileId(file.id);
  return activity ? canSeeInternal(auth, activity.clubId) : false;
});

// ปีงบประมาณของแผน: ปีที่แล้ว ปีนี้ หรือปีหน้า (กันพิมพ์ผิด)
function assertPlanFiscalYear(fiscalYear: number): void {
  const current = fiscalYearOf();
  if (fiscalYear < current - 1 || fiscalYear > current + 1) {
    throw new AppError(422, 'FISCAL_YEAR_OUT_OF_RANGE', `ปีงบประมาณต้องอยู่ระหว่าง ${current - 1}–${current + 1}`);
  }
}

// ---------- แผนกิจกรรม ----------

// ต้อง login เท่านั้น: แผนกิจกรรมของชมรมในปีงบประมาณ
export async function getActivityPlan(clubId: string, fiscalYear: number) {
  return { fiscalYear, items: await listPlannedActivities(clubId, fiscalYear) };
}

export async function addPlannedActivity(auth: AuthContext, clubId: string, fiscalYear: number, fields: PlannedActivityFields): Promise<string> {
  await assertCanManage(auth, clubId);
  assertPlanFiscalYear(fiscalYear);
  return withTransaction((client) => insertPlannedActivity(clubId, fiscalYear, fields, auth.user.id, client));
}

export async function editPlannedActivity(auth: AuthContext, clubId: string, planId: string, fields: PlannedActivityFields): Promise<void> {
  await assertCanManage(auth, clubId);
  const updated = await withTransaction((client) => updatePlannedActivity(planId, clubId, fields, client));
  if (!updated) throw new AppError(404, 'PLAN_NOT_FOUND', 'ไม่พบรายการในแผน');
}

// ลบแผน (soft delete) กิจกรรมที่จัดไปแล้วตามแผนนี้ยังอยู่ และยังอ้างถึงแผนเดิมได้
export async function removePlannedActivity(auth: AuthContext, clubId: string, planId: string): Promise<void> {
  await assertCanManage(auth, clubId);
  const deleted = await withTransaction((client) => softDeletePlannedActivity(planId, clubId, client));
  if (!deleted) throw new AppError(404, 'PLAN_NOT_FOUND', 'ไม่พบรายการในแผน');
}

// ---------- กิจกรรมที่จัดจริง ----------

async function validateActivity(auth: AuthContext, clubId: string, activityId: string | null, input: ActivityInput, client: DbClient) {
  if (input.heldOn > bangkokDateString()) {
    throw new AppError(422, 'HELD_ON_IN_FUTURE', 'วันที่จัดกิจกรรมต้องไม่เป็นวันในอนาคต (บันทึกแผนล่วงหน้าที่แผนกิจกรรม)');
  }
  if (input.photoFileIds.length > MAX_ACTIVITY_PHOTOS) {
    throw new AppError(422, 'TOO_MANY_FILES', `แนบรูปได้ไม่เกิน ${MAX_ACTIVITY_PHOTOS} รูป`);
  }
  if (new Set(input.photoFileIds).size !== input.photoFileIds.length || new Set(input.participantUserIds).size !== input.participantUserIds.length) {
    throw new AppError(422, 'DUPLICATE_ITEMS', 'มีรายการซ้ำกัน');
  }
  if (input.plannedActivityId && !(await plannedActivityBelongsToClub(input.plannedActivityId, clubId, client))) {
    throw new AppError(422, 'PLAN_NOT_FOUND', 'ไม่พบรายการในแผนของชมรมนี้');
  }
  if (input.participantUserIds.length > 0 && (await findNonMembers(clubId, input.participantUserIds, client)).length > 0) {
    throw new AppError(422, 'PARTICIPANT_NOT_MEMBER', 'ผู้เข้าร่วมที่เลือกต้องเป็นสมาชิกของชมรม');
  }
  const previous = activityId ? await listActivityFileIds(activityId, client) : [];
  for (const fileId of input.photoFileIds.filter((id) => !previous.includes(id))) {
    await assertAttachableFile(auth, fileId, 'activity_photo', client);
    const attached = await findActivityByFileId(fileId, client);
    if (attached && attached.id !== activityId) {
      throw new AppError(409, 'FILE_ALREADY_ATTACHED', 'รูปนี้แนบกับกิจกรรมอื่นอยู่แล้ว กรุณาอัปโหลดใหม่');
    }
  }
  return previous;
}

// เลือกรายชื่อผู้เข้าร่วมแล้ว → ระบบนับให้ (ไม่เก็บตัวเลขที่กรอก เพื่อไม่ให้ขัดกัน)
function fieldsOf(input: ActivityInput): ActivityFields {
  return { ...input, participantCount: input.participantUserIds.length > 0 ? null : input.participantCount };
}

async function assertClubExists(clubId: string, client: DbClient): Promise<void> {
  const status = await lockClubStatus(clubId, client);
  if (!status) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
}

export async function recordActivity(auth: AuthContext, clubId: string, input: ActivityInput): Promise<string> {
  await assertCanManage(auth, clubId);
  return withTransaction(async (client) => {
    await assertClubExists(clubId, client);
    await validateActivity(auth, clubId, null, input, client);
    const id = await insertActivity(clubId, fieldsOf(input), auth.user.id, client);
    await replaceParticipants(id, input.participantUserIds, client);
    await replaceActivityFiles(id, input.photoFileIds, client);
    return id;
  });
}

export async function editActivity(auth: AuthContext, activityId: string, input: ActivityInput): Promise<void> {
  const record = await findActivityRecord(activityId);
  if (!record) throw activityNotFound();
  await assertCanManage(auth, record.clubId);
  const removed = await withTransaction(async (client) => {
    if (!(await lockActivity(activityId, client))) throw activityNotFound();
    const previous = await validateActivity(auth, record.clubId, activityId, input, client);
    await updateActivity(activityId, fieldsOf(input), client);
    await replaceParticipants(activityId, input.participantUserIds, client);
    await replaceActivityFiles(activityId, input.photoFileIds, client);
    return previous.filter((id) => !input.photoFileIds.includes(id));
  });
  for (const fileId of removed) await discardFileIfUnused(fileId);
}

// ลบกิจกรรม (soft delete เก็บไว้เป็นประวัติ รูปยังผูกอยู่กับแถวเดิม)
export async function deleteActivity(auth: AuthContext, activityId: string): Promise<void> {
  const record = await findActivityRecord(activityId);
  if (!record) throw activityNotFound();
  await assertCanManage(auth, record.clubId);
  await withTransaction(async (client) => {
    if (!(await lockActivity(activityId, client))) throw activityNotFound();
    await softDeleteActivity(activityId, client);
  });
}

// ต้อง login เท่านั้น: กิจกรรมของชมรมในปีงบประมาณ (ล่าสุดก่อน)
export async function getActivities(clubId: string, fiscalYear: number) {
  const { start, end } = fiscalYearRange(fiscalYear);
  return { fiscalYear, items: await listActivities(clubId, start, end, 500) };
}

/**
 * รายละเอียดกิจกรรม: ทุกคนที่ login เห็นข้อมูลทั่วไป
 * สมาชิก/ผู้ดูข้อมูลภายในเห็นรายชื่อผู้เข้าร่วมและรูป, ผู้มี club_activity:manage แก้ไขได้
 */
export async function getActivity(auth: AuthContext, activityId: string) {
  const detail = await findActivityDetail(activityId);
  if (!detail) throw activityNotFound();
  const [internal, canManage] = await Promise.all([
    canSeeInternal(auth, detail.clubId),
    hasClubPermission(auth, detail.clubId, CLUB_PERMISSIONS.ACTIVITY_MANAGE),
  ]);
  const [participants, photos] = internal
    ? await Promise.all([listParticipants(activityId), listActivityPhotos(activityId)])
    : [null, null];
  return {
    ...detail,
    ...(internal ? { participants, photos } : {}),
    me: { canManage },
  };
}
