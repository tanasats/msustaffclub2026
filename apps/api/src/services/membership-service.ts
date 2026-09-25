import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  decideMembership,
  endMembership,
  insertMembershipEvent,
  insertPendingMembership,
  isCurrentCommitteeMember,
  listPendingRequests,
  lockClubStatus,
  lockCurrentMembership,
  lockMembership,
  withdrawMembership,
  type MembershipEndReason,
  type MembershipRecord,
} from '../repositories/memberships-repository.js';
import type { AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { isEligibleForClub } from './club-rules.js';
import { bangkokDateString } from './fiscal-year.js';

/**
 * เหตุพ้นสภาพที่กรรมการกำหนดได้ (ระเบียบข้อ 20)
 * "ลาออก" ทำโดยสมาชิกเอง และ "ชมรมถูกยุบ" ทำโดยระบบ จึงไม่อยู่ในรายการนี้
 */
export const REMOVAL_REASONS = ['removed_by_resolution', 'disciplinary', 'left_university', 'deceased'] as const satisfies readonly MembershipEndReason[];
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

function membershipNotFound(): AppError {
  return new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'ไม่พบใบสมัครหรือสมาชิกภาพ');
}

// ชมรมต้องมีอยู่ และยังดำเนินการอยู่ (ชมรมที่ถูกระงับ/ยุบ รับสมาชิกหรือเปลี่ยนแปลงสมาชิกไม่ได้)
async function assertClubActive(clubId: string, client: DbClient): Promise<void> {
  const status = await lockClubStatus(clubId, client);
  if (!status) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  if (status !== 'active') {
    throw new AppError(409, 'CLUB_NOT_ACTIVE', 'ชมรมนี้ไม่ได้ดำเนินการอยู่ จึงเปลี่ยนแปลงสมาชิกไม่ได้');
  }
}

// ---------- ผู้ใช้ทำกับสมาชิกภาพของตัวเอง ----------

/**
 * สมัครเป็นสมาชิก → รอกรรมการอนุมัติ (ระเบียบข้อ 17)
 * เฉพาะบัญชีบุคลากร (ยังไม่เปิดให้นิสิต) ไม่เก็บรูปถ่าย/สำเนาบัตร เพราะยืนยันตัวตนผ่าน Google + ERP แล้ว
 */
export async function applyForMembership(auth: AuthContext, clubId: string): Promise<void> {
  if (!isEligibleForClub(auth.user.email)) {
    throw new AppError(403, 'NOT_ELIGIBLE', 'ขณะนี้ชมรมเปิดรับสมัครเฉพาะบุคลากรของมหาวิทยาลัย');
  }
  await withTransaction(async (client) => {
    await assertClubActive(clubId, client);
    const current = await lockCurrentMembership(clubId, auth.user.id, client);
    if (current) {
      throw new AppError(409, 'ALREADY_APPLIED', current.status === 'active' ? 'คุณเป็นสมาชิกชมรมนี้อยู่แล้ว' : 'คุณสมัครชมรมนี้ไว้แล้ว รอกรรมการอนุมัติ');
    }
    let membershipId: string;
    try {
      membershipId = await insertPendingMembership(clubId, auth.user.id, client);
    } catch (err) {
      // กดสมัครซ้อนกัน 2 ครั้ง: partial unique index ปฏิเสธครั้งที่ 2
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'ALREADY_APPLIED', 'คุณสมัครชมรมนี้ไว้แล้ว');
      }
      throw err;
    }
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'applied', note: null }, client);
  });
}

// ยกเลิกใบสมัครที่ยังรออนุมัติ (เก็บเป็นสถานะ withdrawn ไม่ลบแถว)
export async function withdrawApplication(auth: AuthContext, clubId: string): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockCurrentMembership(clubId, auth.user.id, client);
    if (!current || current.status !== 'pending') throw membershipNotFound();
    await withdrawMembership(current.id, client);
    await insertMembershipEvent({ membershipId: current.id, actorUserId: auth.user.id, action: 'withdrawn', note: null }, client);
  });
}

/**
 * ลาออกจากชมรม มีผลทันที (ระเบียบข้อ 20(3))
 * กรรมการต้องพ้นจากตำแหน่งกรรมการก่อน (ระเบียบข้อ 12 แยกการลาออกจากกรรมการไว้ต่างหาก)
 */
export async function leaveClub(auth: AuthContext, clubId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockCurrentMembership(clubId, auth.user.id, client);
    if (!current || current.status !== 'active') throw membershipNotFound();
    if (await isCurrentCommitteeMember(clubId, auth.user.id, client)) {
      throw new AppError(409, 'COMMITTEE_MUST_RESIGN_FIRST', 'คุณเป็นกรรมการของชมรมนี้ ต้องพ้นจากตำแหน่งกรรมการก่อนจึงลาออกจากชมรมได้');
    }
    await endMembership(current.id, bangkokDateString(), 'resigned', client);
    await insertMembershipEvent({ membershipId: current.id, actorUserId: auth.user.id, action: 'left', note }, client);
  });
}

// ---------- กรรมการจัดการสมาชิก (สิทธิ์ชมรม club_member:approve) ----------

async function lockForDecision(
  auth: AuthContext,
  clubId: string,
  membershipId: string,
  client: DbClient,
): Promise<MembershipRecord> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.MEMBER_APPROVE))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการสมาชิกของชมรมนี้');
  }
  await assertClubActive(clubId, client);
  const membership = await lockMembership(membershipId, clubId, client);
  if (!membership) throw membershipNotFound();
  if (membership.userId === auth.user.id) {
    throw new AppError(403, 'CANNOT_DECIDE_OWN_MEMBERSHIP', 'จัดการสมาชิกภาพของตนเองไม่ได้');
  }
  return membership;
}

export async function listMembershipRequests(clubId: string) {
  return { items: await listPendingRequests(clubId) };
}

export async function approveMembership(auth: AuthContext, clubId: string, membershipId: string): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (membership.status !== 'pending') {
      throw new AppError(409, 'INVALID_STATUS', 'ใบสมัครนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
    }
    await decideMembership(membershipId, 'active', auth.user.id, client);
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'approved', note: null }, client);
  });
}

export async function rejectMembership(auth: AuthContext, clubId: string, membershipId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (membership.status !== 'pending') {
      throw new AppError(409, 'INVALID_STATUS', 'ใบสมัครนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
    }
    await decideMembership(membershipId, 'rejected', auth.user.id, client);
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'rejected', note }, client);
  });
}

/**
 * ให้สมาชิกพ้นสภาพ (ระเบียบข้อ 20) ต้องระบุเหตุตามระเบียบและคำอธิบายเสมอ
 * กรรมการที่ยังดำรงตำแหน่งต้องพ้นจากตำแหน่งก่อน
 */
export async function removeMember(
  auth: AuthContext,
  clubId: string,
  membershipId: string,
  reason: RemovalReason,
  note: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (membership.status !== 'active') {
      throw new AppError(409, 'INVALID_STATUS', 'ผู้ใช้นี้ไม่ได้เป็นสมาชิกอยู่');
    }
    if (await isCurrentCommitteeMember(clubId, membership.userId, client)) {
      throw new AppError(409, 'COMMITTEE_MUST_RESIGN_FIRST', 'สมาชิกคนนี้เป็นกรรมการ ต้องให้พ้นจากตำแหน่งกรรมการก่อน');
    }
    await endMembership(membershipId, bangkokDateString(), reason, client);
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'removed', note }, client);
  });
}
