import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import { listClubPositions, type ClubPositionRecord } from '../repositories/club-master-repository.js';
import {
  countCurrentInPosition,
  endCommitteeMember,
  insertCommitteeEvent,
  insertCommitteeMember,
  isCurrentAdvisor,
  listCommitteeHistory,
  lockClubForCommitteeChange,
  lockCurrentCommitteeMember,
  lockCurrentCommitteeOfUser,
  lockCurrentHolders,
  type CommitteeEndReason,
} from '../repositories/committee-repository.js';
import { lockCurrentMembership } from '../repositories/memberships-repository.js';
import type { AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { PRESIDENT_POSITION_CODE } from './club-rules.js';
import { bangkokDateString } from './fiscal-year.js';

/**
 * เหตุพ้นตำแหน่งที่ผู้จัดการกรรมการกำหนดได้ (ระเบียบข้อ 12)
 * "ลาออกจากกรรมการ" ทำโดยกรรมการเอง, "ชมรมถูกยุบ" ทำโดยระบบ, "replaced" ใช้ตอนโอนตำแหน่งประธาน จึงไม่อยู่ในรายการนี้
 */
export const COMMITTEE_END_REASONS = [
  'term_ended',
  'removed_by_resolution',
  'disciplinary',
  'left_university',
  'deceased',
] as const satisfies readonly CommitteeEndReason[];
export type CommitteeEndByManagerReason = (typeof COMMITTEE_END_REASONS)[number];

export interface AppointInput {
  userId: string;
  positionCode: string;
  // ชื่อตำแหน่งที่แสดง เช่น "ฝ่ายสวัสดิการ" (ว่าง = ใช้ชื่อมาตรฐานของตำแหน่ง)
  positionTitle: string | null;
  workLocation: string | null;
  contactPhone: string | null;
  note: string | null;
}

export interface TransferInput {
  userId: string;
  workLocation: string | null;
  contactPhone: string | null;
  note: string | null;
}

function committeeNotFound(): AppError {
  return new AppError(404, 'COMMITTEE_MEMBER_NOT_FOUND', 'ไม่พบกรรมการที่ดำรงตำแหน่งอยู่');
}

function presidentMustTransfer(): AppError {
  return new AppError(409, 'PRESIDENT_MUST_TRANSFER', 'ประธานชมรมพ้นตำแหน่งได้ด้วยการโอนตำแหน่งให้สมาชิกคนอื่นเท่านั้น');
}

// ชมรมต้องมีอยู่ (ล็อกแถวชมรมไว้จนจบ transaction เพื่อให้การเปลี่ยนกรรมการทำทีละรายการ)
async function lockClub(clubId: string, client: DbClient, requireActive: boolean): Promise<void> {
  const status = await lockClubForCommitteeChange(clubId, client);
  if (!status) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  if (requireActive && status !== 'active') {
    throw new AppError(409, 'CLUB_NOT_ACTIVE', 'ชมรมนี้ไม่ได้ดำเนินการอยู่ จึงเปลี่ยนแปลงกรรมการไม่ได้');
  }
}

/**
 * ตรวจสิทธิ์หลังล็อกแถวชมรมแล้วเสมอ: ถ้ามีการโอนตำแหน่งประธานที่ commit ไปก่อนหน้า
 * ประธานคนเดิมต้องหมดสิทธิ์ทันที (hasClubPermission อ่านผ่าน pool จึงเห็นข้อมูลที่ commit แล้ว)
 */
async function assertCanManage(auth: AuthContext, clubId: string): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.COMMITTEE_MANAGE))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการกรรมการของชมรมนี้');
  }
}

/**
 * ผู้ที่จะรับตำแหน่งต้องเป็นสมาชิก active ของชมรม และไม่ใช่ที่ปรึกษาของชมรม
 * ห้ามแต่งตั้ง/โอนตำแหน่งให้ตัวเอง
 */
async function assertAppointable(auth: AuthContext, clubId: string, userId: string, client: DbClient): Promise<void> {
  if (userId === auth.user.id) {
    throw new AppError(403, 'CANNOT_MANAGE_OWN_POSITION', 'แต่งตั้งหรือโอนตำแหน่งให้ตนเองไม่ได้');
  }
  const membership = await lockCurrentMembership(clubId, userId, client);
  if (membership?.status !== 'active') {
    throw new AppError(422, 'NOT_ACTIVE_MEMBER', 'ผู้ที่จะรับตำแหน่งต้องเป็นสมาชิกของชมรมก่อน');
  }
  if (await isCurrentAdvisor(clubId, userId, client)) {
    throw new AppError(422, 'ADVISOR_CANNOT_BE_COMMITTEE', 'ที่ปรึกษาชมรมเป็นกรรมการในชมรมเดียวกันไม่ได้');
  }
}

async function findPosition(code: string, client: DbClient): Promise<ClubPositionRecord> {
  const position = (await listClubPositions(client)).find((p) => p.code === code);
  if (!position || position.kind !== 'committee') {
    throw new AppError(422, 'POSITION_NOT_FOUND', 'ไม่พบตำแหน่งกรรมการที่เลือก');
  }
  return position;
}

// ---------- ผู้มีสิทธิ์ club_committee:manage (ประธาน / club:manage_all) ----------

/**
 * แต่งตั้งกรรมการ (ตามผลการเลือกตั้งของสมาชิก ระเบียบข้อ 8–9)
 * 1 คนดำรงตำแหน่งกรรมการได้ 1 ตำแหน่ง, ตำแหน่งประธานใช้การโอนตำแหน่งแทน
 */
export async function appointCommitteeMember(auth: AuthContext, clubId: string, input: AppointInput): Promise<string> {
  return withTransaction(async (client) => {
    await lockClub(clubId, client, true);
    await assertCanManage(auth, clubId);
    const position = await findPosition(input.positionCode, client);
    if (position.code === PRESIDENT_POSITION_CODE) {
      throw new AppError(422, 'USE_PRESIDENCY_TRANSFER', 'เปลี่ยนประธานชมรมด้วยการโอนตำแหน่งประธาน');
    }
    await assertAppointable(auth, clubId, input.userId, client);
    if (await lockCurrentCommitteeOfUser(clubId, input.userId, client)) {
      throw new AppError(409, 'ALREADY_COMMITTEE', 'ผู้ใช้นี้ดำรงตำแหน่งกรรมการอยู่แล้ว (1 คน 1 ตำแหน่ง)');
    }
    if (position.maxPerClub !== null && (await countCurrentInPosition(clubId, position.id, client)) >= position.maxPerClub) {
      throw new AppError(422, 'POSITION_LIMIT_EXCEEDED', `ตำแหน่ง${position.nameTh}มีได้ไม่เกิน ${position.maxPerClub} คน`);
    }

    const id = await insertCommitteeMember(
      {
        clubId,
        userId: input.userId,
        positionId: position.id,
        positionTitle: input.positionTitle ?? position.nameTh,
        workLocation: input.workLocation,
        contactPhone: input.contactPhone,
        startedOn: bangkokDateString(),
      },
      client,
    );
    await insertCommitteeEvent({ committeeMemberId: id, actorUserId: auth.user.id, action: 'appointed', note: input.note }, client);
    return id;
  });
}

/**
 * ให้กรรมการพ้นตำแหน่ง (ระเบียบข้อ 12) ต้องระบุเหตุและคำอธิบาย
 * ยังเป็นสมาชิกชมรมต่อ (การพ้นสภาพสมาชิกเป็นอีกขั้นตอนหนึ่ง)
 */
export async function endCommitteeTerm(
  auth: AuthContext,
  clubId: string,
  committeeMemberId: string,
  reason: CommitteeEndByManagerReason,
  note: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await lockClub(clubId, client, true);
    await assertCanManage(auth, clubId);
    const member = await lockCurrentCommitteeMember(committeeMemberId, clubId, client);
    if (!member) throw committeeNotFound();
    if (member.userId === auth.user.id) {
      throw new AppError(403, 'CANNOT_MANAGE_OWN_POSITION', 'ใช้เมนูลาออกจากตำแหน่งกรรมการแทน');
    }
    if (member.positionCode === PRESIDENT_POSITION_CODE) throw presidentMustTransfer();

    await endCommitteeMember(member.id, bangkokDateString(), reason, client);
    await insertCommitteeEvent({ committeeMemberId: member.id, actorUserId: auth.user.id, action: 'ended', note }, client);
  });
}

/**
 * โอนตำแหน่งประธานในขั้นตอนเดียว: ประธานคนเดิมพ้นตำแหน่ง (replaced) และคนใหม่รับตำแหน่งพร้อมกัน
 * ชมรมจึงมีประธานเสมอ ถ้าผู้รับตำแหน่งดำรงตำแหน่งกรรมการอื่นอยู่ ตำแหน่งเดิมสิ้นสุดลง (1 คน 1 ตำแหน่ง)
 * ผู้มี club:manage_all ทำแทนได้ (เช่น ประธานเดิมไม่อยู่)
 */
export async function transferPresidency(auth: AuthContext, clubId: string, input: TransferInput): Promise<void> {
  await withTransaction(async (client) => {
    await lockClub(clubId, client, true);
    await assertCanManage(auth, clubId);
    await assertAppointable(auth, clubId, input.userId, client);
    const position = await findPosition(PRESIDENT_POSITION_CODE, client);
    const today = bangkokDateString();
    const note = input.note;

    const presidents = await lockCurrentHolders(clubId, PRESIDENT_POSITION_CODE, client);
    if (presidents.some((p) => p.userId === input.userId)) {
      throw new AppError(409, 'ALREADY_PRESIDENT', 'ผู้ใช้นี้เป็นประธานชมรมอยู่แล้ว');
    }
    for (const president of presidents) {
      await endCommitteeMember(president.id, today, 'replaced', client);
      await insertCommitteeEvent({ committeeMemberId: president.id, actorUserId: auth.user.id, action: 'ended', note }, client);
    }

    const previous = await lockCurrentCommitteeOfUser(clubId, input.userId, client);
    if (previous) {
      await endCommitteeMember(previous.id, today, 'replaced', client);
      await insertCommitteeEvent(
        { committeeMemberId: previous.id, actorUserId: auth.user.id, action: 'ended', note: 'รับตำแหน่งประธานชมรม' },
        client,
      );
    }

    const id = await insertCommitteeMember(
      {
        clubId,
        userId: input.userId,
        positionId: position.id,
        positionTitle: position.nameTh,
        workLocation: input.workLocation,
        contactPhone: input.contactPhone,
        startedOn: today,
      },
      client,
    );
    await insertCommitteeEvent({ committeeMemberId: id, actorUserId: auth.user.id, action: 'appointed', note }, client);
  });
}

// ---------- กรรมการทำกับตำแหน่งของตัวเอง ----------

/**
 * ลาออกจากตำแหน่งกรรมการ (ระเบียบข้อ 12) มีผลทันที ยังเป็นสมาชิกชมรมต่อ
 * ประธานต้องโอนตำแหน่งก่อน ทำได้แม้ชมรมถูกระงับ (เหมือนการลาออกจากชมรม)
 */
export async function resignFromCommittee(auth: AuthContext, clubId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    await lockClub(clubId, client, false);
    const member = await lockCurrentCommitteeOfUser(clubId, auth.user.id, client);
    if (!member) throw committeeNotFound();
    if (member.positionCode === PRESIDENT_POSITION_CODE) throw presidentMustTransfer();

    await endCommitteeMember(member.id, bangkokDateString(), 'resigned_position', client);
    await insertCommitteeEvent({ committeeMemberId: member.id, actorUserId: auth.user.id, action: 'ended', note }, client);
  });
}

// ประวัติกรรมการที่พ้นตำแหน่งแล้ว — route ตรวจ club:view_internal ด้วย requireClubPermission แล้ว
export async function getCommitteeHistory(clubId: string) {
  return { items: await listCommitteeHistory(clubId, 200) };
}
