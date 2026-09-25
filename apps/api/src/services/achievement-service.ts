import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  decideAchievement,
  findAchievementByFileId,
  findAchievementDetail,
  findAchievementRecord,
  insertAchievement,
  insertAchievementEvent,
  listAchievementEvents,
  listAchievementFileIds,
  listAchievementFiles,
  listAchievementsOfUser,
  listApprovedAchievements,
  listPendingAchievements,
  lockAchievement,
  replaceAchievementFiles,
  setAchievementWithdrawn,
  updateAchievementFields,
  type AchievementFields,
  type AchievementRecord,
} from '../repositories/achievements-repository.js';
import { lockCurrentMembership, lockClubStatus } from '../repositories/memberships-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { bangkokDateString } from './fiscal-year.js';
import { assertAttachableFile, discardFileIfUnused, registerFileReadAccess } from './files-service.js';
import { PERMISSIONS } from './permissions.js';

// ไฟล์หลักฐานสูงสุดต่อผลงาน
export const MAX_ACHIEVEMENT_FILES = 5;

// เจ้าของแก้ไข/ถอนได้เฉพาะสถานะเหล่านี้ (รับรองแล้วแก้ไม่ได้)
const OWNER_EDITABLE_STATUSES = ['pending', 'returned'] as const;

export interface AchievementInput extends AchievementFields {
  fileIds: string[];
}

function notFound(): AppError {
  return new AppError(404, 'ACHIEVEMENT_NOT_FOUND', 'ไม่พบผลงาน');
}

// ---------- สิทธิ์ ----------

// ผู้รับรอง = ผู้มีสิทธิ์ชมรม club_achievement:manage ในชมรมของผลงาน (ชมรมที่ไม่ active จะไม่มีสิทธิ์นี้)
function canReview(auth: AuthContext, clubId: string): Promise<boolean> {
  return hasClubPermission(auth, clubId, CLUB_PERMISSIONS.ACHIEVEMENT_MANAGE);
}

/**
 * ดูผลงานที่ยังไม่รับรองและไฟล์แนบได้: เจ้าของ, กรรมการที่มี club_achievement:manage, เจ้าหน้าที่ (club:read_all)
 * ผลงานที่รับรองแล้ว (ไม่รวมไฟล์แนบ) ทุกคนที่ login เห็นได้
 */
async function canSeeInternal(auth: AuthContext, achievement: AchievementRecord): Promise<boolean> {
  if (achievement.userId === auth.user.id) return true;
  if (hasPermission(auth, PERMISSIONS.CLUB_READ_ALL)) return true;
  return canReview(auth, achievement.clubId);
}

// ไฟล์หลักฐาน: อ่านได้ตามสิทธิ์ดูข้อมูลภายในของผลงานที่ไฟล์แนบอยู่
registerFileReadAccess('achievement_evidence', async (auth, file) => {
  const achievement = await findAchievementByFileId(file.id);
  return achievement ? canSeeInternal(auth, achievement) : false;
});

// ---------- ตรวจข้อมูล ----------

function assertFields(input: AchievementInput): void {
  if (input.achievedOn > bangkokDateString()) {
    throw new AppError(422, 'ACHIEVED_ON_IN_FUTURE', 'วันที่ได้รับผลงานต้องไม่เป็นวันในอนาคต');
  }
  if (input.fileIds.length > MAX_ACHIEVEMENT_FILES) {
    throw new AppError(422, 'TOO_MANY_FILES', `แนบไฟล์ได้ไม่เกิน ${MAX_ACHIEVEMENT_FILES} ไฟล์`);
  }
  if (new Set(input.fileIds).size !== input.fileIds.length) {
    throw new AppError(422, 'DUPLICATE_FILES', 'มีไฟล์ซ้ำกัน');
  }
}

// ไฟล์ใหม่ต้องเป็นของผู้ใช้เอง อัปโหลดเสร็จแล้ว และยังไม่ได้แนบกับผลงานอื่น
async function assertFilesAttachable(auth: AuthContext, achievementId: string | null, fileIds: string[], client: DbClient): Promise<void> {
  for (const fileId of fileIds) {
    await assertAttachableFile(auth, fileId, 'achievement_evidence', client);
    const attached = await findAchievementByFileId(fileId, client);
    if (attached && attached.id !== achievementId) {
      throw new AppError(409, 'FILE_ALREADY_ATTACHED', 'ไฟล์นี้แนบกับผลงานอื่นอยู่แล้ว กรุณาอัปโหลดใหม่');
    }
  }
}

// ผู้บันทึกต้องเป็นสมาชิก active ของชมรมที่ยังดำเนินการอยู่
async function assertActiveMemberOfActiveClub(auth: AuthContext, clubId: string, client: DbClient): Promise<void> {
  const status = await lockClubStatus(clubId, client);
  if (!status) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  if (status !== 'active') throw new AppError(409, 'CLUB_NOT_ACTIVE', 'ชมรมนี้ไม่ได้ดำเนินการอยู่');
  const membership = await lockCurrentMembership(clubId, auth.user.id, client);
  if (membership?.status !== 'active') {
    throw new AppError(403, 'NOT_ACTIVE_MEMBER', 'บันทึกผลงานได้เฉพาะสมาชิกของชมรม');
  }
}

// ---------- เจ้าของผลงาน ----------

// บันทึกผลงานของตัวเองในนามชมรม → รอรับรอง
export async function submitAchievement(auth: AuthContext, clubId: string, input: AchievementInput): Promise<string> {
  assertFields(input);
  return withTransaction(async (client) => {
    await assertActiveMemberOfActiveClub(auth, clubId, client);
    await assertFilesAttachable(auth, null, input.fileIds, client);
    const id = await insertAchievement(clubId, auth.user.id, input, client);
    await replaceAchievementFiles(id, input.fileIds, client);
    await insertAchievementEvent({ achievementId: id, actorUserId: auth.user.id, action: 'submitted', note: null }, client);
    return id;
  });
}

async function lockOwnEditable(auth: AuthContext, achievementId: string, client: DbClient): Promise<AchievementRecord> {
  const achievement = await lockAchievement(achievementId, client);
  if (!achievement || achievement.userId !== auth.user.id) throw notFound();
  if (!(OWNER_EDITABLE_STATUSES as readonly string[]).includes(achievement.status)) {
    throw new AppError(409, 'ACHIEVEMENT_NOT_EDITABLE', 'ผลงานนี้อยู่ในสถานะที่แก้ไขไม่ได้');
  }
  return achievement;
}

/**
 * แก้ไขผลงาน (ขณะรอรับรอง) หรือแก้แล้วส่งใหม่ (หลังถูกส่งกลับ) → สถานะกลับเป็นรอรับรอง
 * ไฟล์ที่เอาออกจะถูกลบทิ้งหลัง commit
 */
export async function updateAchievement(auth: AuthContext, achievementId: string, input: AchievementInput): Promise<void> {
  assertFields(input);
  const removedFileIds = await withTransaction(async (client) => {
    const achievement = await lockOwnEditable(auth, achievementId, client);
    await assertActiveMemberOfActiveClub(auth, achievement.clubId, client);
    const previous = await listAchievementFileIds(achievementId, client);
    await assertFilesAttachable(auth, achievementId, input.fileIds.filter((id) => !previous.includes(id)), client);

    await updateAchievementFields(achievementId, input, client);
    await replaceAchievementFiles(achievementId, input.fileIds, client);
    await insertAchievementEvent(
      {
        achievementId,
        actorUserId: auth.user.id,
        action: achievement.status === 'returned' ? 'resubmitted' : 'updated',
        note: null,
      },
      client,
    );
    return previous.filter((id) => !input.fileIds.includes(id));
  });
  for (const fileId of removedFileIds) await discardFileIfUnused(fileId);
}

// ถอนผลงาน (เก็บเป็นประวัติ ไม่ลบ)
export async function withdrawAchievement(auth: AuthContext, achievementId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    await lockOwnEditable(auth, achievementId, client);
    await setAchievementWithdrawn(achievementId, client);
    await insertAchievementEvent({ achievementId, actorUserId: auth.user.id, action: 'withdrawn', note }, client);
  });
}

// ---------- กรรมการรับรอง ----------

export type ReviewDecision = 'approve' | 'return' | 'reject';
const DECISION_STATUS = { approve: 'approved', return: 'returned', reject: 'rejected' } as const;

/**
 * พิจารณาผลงานที่รอรับรอง: รับรอง / ส่งกลับแก้ไข / ไม่รับรอง (ส่งกลับและไม่รับรองต้องมีเหตุผล)
 * รับรองผลงานของตัวเองไม่ได้
 */
export async function reviewAchievement(
  auth: AuthContext,
  achievementId: string,
  decision: ReviewDecision,
  note: string | null,
): Promise<void> {
  if (decision !== 'approve' && !note) {
    throw new AppError(422, 'NOTE_REQUIRED', 'กรุณาระบุเหตุผล');
  }
  await withTransaction(async (client) => {
    const achievement = await lockAchievement(achievementId, client);
    if (!achievement) throw notFound();
    if (!(await canReview(auth, achievement.clubId))) {
      // ไม่บอกว่ามีผลงานนี้ ถ้าไม่มีสิทธิ์ดูข้อมูลภายใน
      if (!(await canSeeInternal(auth, achievement))) throw notFound();
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์รับรองผลงานของชมรมนี้');
    }
    if (achievement.userId === auth.user.id) {
      throw new AppError(403, 'CANNOT_REVIEW_OWN_ACHIEVEMENT', 'รับรองผลงานของตนเองไม่ได้');
    }
    if (achievement.status !== 'pending') {
      throw new AppError(409, 'INVALID_STATUS', 'ผลงานนี้ไม่ได้อยู่ในสถานะรอรับรอง');
    }
    const status = DECISION_STATUS[decision];
    await decideAchievement(achievementId, status, auth.user.id, note, client);
    await insertAchievementEvent({ achievementId, actorUserId: auth.user.id, action: status, note }, client);
  });
}

// ---------- อ่านข้อมูล ----------

/**
 * รายละเอียดผลงาน
 * - ผู้มีสิทธิ์ดูข้อมูลภายใน: ทุกสถานะ พร้อมไฟล์แนบและประวัติ
 * - คนอื่นที่ login: เฉพาะผลงานที่รับรองแล้ว ไม่มีไฟล์แนบ/ประวัติ
 */
export async function getAchievement(auth: AuthContext, achievementId: string) {
  const record = await findAchievementRecord(achievementId);
  if (!record) throw notFound();
  const internal = await canSeeInternal(auth, record);
  if (!internal && record.status !== 'approved') throw notFound();

  const [detail, files, events, reviewer] = await Promise.all([
    findAchievementDetail(achievementId),
    internal ? listAchievementFiles(achievementId) : null,
    internal ? listAchievementEvents(achievementId) : null,
    canReview(auth, record.clubId),
  ]);
  if (!detail) throw notFound();
  return {
    ...detail,
    ...(internal ? { files, events } : {}),
    me: {
      isOwner: record.userId === auth.user.id,
      canEdit: record.userId === auth.user.id && (OWNER_EDITABLE_STATUSES as readonly string[]).includes(record.status),
      canReview: reviewer && record.userId !== auth.user.id && record.status === 'pending',
    },
  };
}

// ต้อง login เท่านั้น: ผลงานของฉันทุกสถานะ (ติดตามสถานะ)
export async function listMyAchievements(auth: AuthContext, page: number, pageSize: number) {
  const { items, total } = await listAchievementsOfUser(auth.user.id, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

// ต้อง login เท่านั้น: ผลงานที่รับรองแล้วของชมรม
export async function listClubAchievements(clubId: string, page: number, pageSize: number) {
  const { items, total } = await listApprovedAchievements(clubId, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

// คิวรอรับรอง — route ตรวจ club_achievement:manage ด้วย requireClubPermission แล้ว
export async function listAchievementReviewQueue(clubId: string) {
  return { items: await listPendingAchievements(clubId, 200) };
}
