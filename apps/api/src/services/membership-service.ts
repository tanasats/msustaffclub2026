import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  cancelResignation,
  decideMembership,
  endMembership,
  findMyResignation,
  insertMembershipEvent,
  insertPendingMembership,
  isCurrentCommitteeMember,
  listPendingRequests,
  listResignationRequests,
  lockClubStatus,
  lockDueResignations,
  lockCurrentMembership,
  lockMembership,
  requestResignation,
  resolveInvitation,
  insertInvitation,
  listClubInvitations,
  listMyInvitations,
  restoreMembership,
  softDeleteMembership,
  withdrawMembership,
  DELETABLE_MEMBERSHIP_STATUSES,
  type MembershipEndReason,
  type MembershipRecord,
} from '../repositories/memberships-repository.js';
import { endAthletesOfMember } from '../repositories/sports-repository.js';
import { hasMemberRecords } from '../repositories/club-members-repository.js';
import { findUserSummariesByIds } from '../repositories/users-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { PERMISSIONS } from './permissions.js';
import {
  notifyMembershipApplied,
  notifyMembershipDecided,
  notifyMembershipInvited,
  notifyResignationRequested,
} from './notification-service.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { isEligibleForClub } from './club-rules.js';
import { bangkokDateString } from './fiscal-year.js';
import { logger } from '../logger.js';

// ยื่นลาออกแล้วไม่มีกรรมการรับทราบ → มีผลอัตโนมัติเมื่อครบจำนวนวันนี้ (ผู้ใช้ยืนยันแล้ว)
export const RESIGNATION_AUTO_EFFECT_DAYS = 30;

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
      const messages = {
        active: 'คุณเป็นสมาชิกชมรมนี้อยู่แล้ว',
        invited: 'คุณได้รับคำเชิญจากชมรมนี้แล้ว กรุณาตอบรับคำเชิญแทนการสมัคร',
      } as Record<string, string>;
      throw new AppError(409, current.status === 'invited' ? 'ALREADY_INVITED' : 'ALREADY_APPLIED', messages[current.status] ?? 'คุณสมัครชมรมนี้ไว้แล้ว รอกรรมการอนุมัติ');
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
    const eventId = await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'applied', note: null }, client);
    await notifyMembershipApplied(client, membershipId, eventId);
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
 * ยื่นลาออกจากชมรม พร้อมเหตุผล → กรรมการรับทราบ หรือมีผลอัตโนมัติเมื่อครบ RESIGNATION_AUTO_EFFECT_DAYS วัน
 * กรรมการปฏิเสธไม่ได้ (ระเบียบข้อ 20(3) การเป็นสมาชิกสิ้นสุดเมื่อลาออก) ระหว่างรอยังเป็นสมาชิกตามปกติ
 * กรรมการต้องพ้นจากตำแหน่งกรรมการก่อน (ระเบียบข้อ 12 แยกการลาออกจากกรรมการไว้ต่างหาก)
 */
export async function leaveClub(auth: AuthContext, clubId: string, note: string): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockCurrentMembership(clubId, auth.user.id, client);
    if (!current || current.status !== 'active') throw membershipNotFound();
    if (await isCurrentCommitteeMember(clubId, auth.user.id, client)) {
      throw new AppError(409, 'COMMITTEE_MUST_RESIGN_FIRST', 'คุณเป็นกรรมการของชมรมนี้ ต้องพ้นจากตำแหน่งกรรมการก่อนจึงลาออกจากชมรมได้');
    }
    if (!(await requestResignation(current.id, note, client))) {
      throw new AppError(409, 'RESIGNATION_ALREADY_REQUESTED', 'คุณยื่นลาออกไว้แล้ว รอกรรมการรับทราบ');
    }
    const eventId = await insertMembershipEvent({ membershipId: current.id, actorUserId: auth.user.id, action: 'resign_requested', note }, client);
    await notifyResignationRequested(client, current.id, note, eventId);
  });
}

// ยกเลิกคำขอลาออกที่ยังไม่มีผล
export async function cancelLeaveRequest(auth: AuthContext, clubId: string): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockCurrentMembership(clubId, auth.user.id, client);
    if (!current || current.status !== 'active' || !(await cancelResignation(current.id, client))) {
      throw new AppError(404, 'RESIGNATION_NOT_FOUND', 'ไม่พบคำขอลาออกที่รอดำเนินการ');
    }
    await insertMembershipEvent({ membershipId: current.id, actorUserId: auth.user.id, action: 'resign_cancelled', note: null }, client);
  });
}

// คำขอลาออกของฉันที่ยังไม่มีผล พร้อมวันที่จะมีผลอัตโนมัติ (แสดงที่หน้าชมรม)
export async function getMyResignation(clubId: string, userId: string) {
  const row = await findMyResignation(clubId, userId);
  if (!row) return null;
  const effectiveAt = new Date(row.requestedAt.getTime() + RESIGNATION_AUTO_EFFECT_DAYS * 24 * 60 * 60 * 1000);
  return { ...row, effectiveAt };
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

// คำขอลาออกที่รอรับทราบ — route ตรวจสิทธิ์ชมรม club_member:approve แล้ว
export async function listResignations(clubId: string) {
  const items = await listResignationRequests(clubId);
  const day = 24 * 60 * 60 * 1000;
  return {
    items: items.map((r) => ({ ...r, effectiveAt: new Date(r.requestedAt.getTime() + RESIGNATION_AUTO_EFFECT_DAYS * day) })),
  };
}

/**
 * กรรมการรับทราบการลาออก → พ้นสภาพ (เหตุ resigned) ทันที
 * ผู้ที่ถูกแต่งตั้งเป็นกรรมการหลังยื่นลาออก ต้องพ้นตำแหน่งก่อน
 */
export async function acknowledgeResignation(auth: AuthContext, clubId: string, membershipId: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    const pending = membership.status === 'active' ? await findMyResignation(clubId, membership.userId, client) : null;
    if (!pending) {
      throw new AppError(409, 'RESIGNATION_NOT_FOUND', 'ไม่พบคำขอลาออกที่รอรับทราบ');
    }
    if (await isCurrentCommitteeMember(clubId, membership.userId, client)) {
      throw new AppError(409, 'COMMITTEE_MUST_RESIGN_FIRST', 'สมาชิกคนนี้เป็นกรรมการ ต้องให้พ้นจากตำแหน่งกรรมการก่อน');
    }
    await endMembership(membershipId, bangkokDateString(), 'resigned', client);
    await endAthletesOfMember(clubId, membership.userId, auth.user.id, client);
    await insertMembershipEvent(
      { membershipId, actorUserId: auth.user.id, action: 'left', note: note ? `รับทราบการลาออก: ${note}` : 'รับทราบการลาออก' },
      client,
    );
  });
}

/**
 * งานอัตโนมัติ: คำขอลาออกที่ครบ RESIGNATION_AUTO_EFFECT_DAYS วันโดยไม่มีกรรมการรับทราบ → มีผล (ผู้กระทำ = ระบบ)
 * ข้ามผู้ที่ยังดำรงตำแหน่งกรรมการ (ต้องพ้นตำแหน่งก่อน) ทำรอบละไม่เกิน limit แถว คืนจำนวนที่มีผล
 */
export async function processDueResignations(limit = 100): Promise<number> {
  return withTransaction(async (client) => {
    const due = await lockDueResignations(RESIGNATION_AUTO_EFFECT_DAYS, limit, client);
    let ended = 0;
    for (const row of due) {
      if (await isCurrentCommitteeMember(row.clubId, row.userId, client)) {
        logger.warn({ membershipId: row.id }, 'membership: ข้ามการลาออกอัตโนมัติ เพราะยังเป็นกรรมการ');
        continue;
      }
      await endMembership(row.id, bangkokDateString(), 'resigned', client);
      // ผู้ยุติการเป็นนักกีฬา = ผู้ลาออกเอง (การลาออกเป็นการกระทำของเขา ระบบเพียงทำให้มีผลตามกำหนด)
      await endAthletesOfMember(row.clubId, row.userId, row.userId, client);
      await insertMembershipEvent(
        { membershipId: row.id, actorUserId: null, action: 'left', note: `ลาออกมีผลอัตโนมัติ (ครบ ${RESIGNATION_AUTO_EFFECT_DAYS} วันหลังยื่น)` },
        client,
      );
      ended += 1;
    }
    return ended;
  });
}

export async function approveMembership(auth: AuthContext, clubId: string, membershipId: string): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (membership.status !== 'pending') {
      throw new AppError(409, 'INVALID_STATUS', 'ใบสมัครนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
    }
    await decideMembership(membershipId, 'active', auth.user.id, client);
    const eventId = await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'approved', note: null }, client);
    await notifyMembershipDecided(client, membershipId, 'approved', null, eventId);
  });
}

export async function rejectMembership(auth: AuthContext, clubId: string, membershipId: string, note: string): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (membership.status !== 'pending') {
      throw new AppError(409, 'INVALID_STATUS', 'ใบสมัครนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
    }
    await decideMembership(membershipId, 'rejected', auth.user.id, client);
    const eventId = await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'rejected', note }, client);
    await notifyMembershipDecided(client, membershipId, 'rejected', note, eventId);
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
    await endAthletesOfMember(clubId, membership.userId, auth.user.id, client);
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'removed', note }, client);
  });
}

// ---------- ลบรายชื่อ / กู้คืน ----------

// ผู้มีสิทธิ์ดูและกู้คืนรายชื่อที่ถูกลบ (permission ระบบ ไม่ผูก role → super_admin)
export function canManageDeletedMemberships(auth: AuthContext): boolean {
  return hasPermission(auth, PERMISSIONS.CLUB_MEMBERSHIP_MANAGE_DELETED);
}

/**
 * กรรมการ (club_member:approve) ลบรายชื่อที่บันทึกผิด (soft delete) ต้องมีเหตุผล
 * - ใบสมัคร (รอ/ไม่อนุมัติ/ยกเลิก) ลบได้
 * - สมาชิก active ลบได้เฉพาะเมื่อยังไม่มีข้อมูลผูกกับชมรม (ผลงาน/กิจกรรม/นักกีฬา/ผลแข่งขัน/ตำแหน่งกรรมการ)
 *   ถ้ามีแล้วต้องใช้ "ให้พ้นสภาพ" เพื่อเก็บประวัติ
 * - ผู้ที่พ้นสภาพแล้วลบไม่ได้ (เป็นประวัติของชมรม)
 */
export async function deleteMembership(auth: AuthContext, clubId: string, membershipId: string, note: string): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (!(DELETABLE_MEMBERSHIP_STATUSES as readonly string[]).includes(membership.status)) {
      throw new AppError(409, 'MEMBERSHIP_NOT_DELETABLE', 'ลบได้เฉพาะใบสมัครหรือสมาชิกที่บันทึกผิด ผู้ที่พ้นสภาพแล้วลบไม่ได้');
    }
    if (membership.status === 'active' && (await hasMemberRecords(clubId, membership.userId, client))) {
      throw new AppError(409, 'MEMBER_HAS_RECORDS', 'สมาชิกคนนี้มีข้อมูลผูกกับชมรมแล้ว (ผลงาน/กิจกรรม/ตำแหน่ง) กรุณาใช้ "ให้พ้นสภาพ" แทน');
    }
    await softDeleteMembership(membershipId, auth.user.id, client);
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'deleted', note }, client);
  });
}

/**
 * ผู้ดูแลระบบกู้คืนรายชื่อที่ถูกลบเป็นสถานะเดิม ต้องมีเหตุผล
 * สถานะเดิมรอ/สมาชิก: ผู้ใช้ต้องยังใช้งานได้ และต้องยังไม่มีใบสมัคร/สมาชิกภาพใหม่ในชมรมเดียวกัน
 */
export async function restoreDeletedMembership(auth: AuthContext, clubId: string, membershipId: string, note: string): Promise<void> {
  if (!canManageDeletedMemberships(auth)) throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดำเนินการนี้');
  await withTransaction(async (client) => {
    const membership = await lockMembership(membershipId, clubId, client);
    if (!membership) throw membershipNotFound();
    if (membership.status !== 'deleted') {
      throw new AppError(409, 'MEMBERSHIP_NOT_DELETED', 'รายการนี้ไม่ได้ถูกลบ');
    }
    const [user] = await findUserSummariesByIds([membership.userId], client);
    if (!user || !user.isActive) {
      throw new AppError(422, 'USER_INACTIVE', 'บัญชีของผู้ใช้นี้ถูกปิดการใช้งานแล้ว จึงกู้คืนไม่ได้');
    }
    let restored: string | null;
    try {
      restored = await restoreMembership(membershipId, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'MEMBERSHIP_CONFLICT', 'ผู้ใช้นี้มีใบสมัครหรือสมาชิกภาพใหม่ในชมรมนี้แล้ว จึงกู้คืนรายการเดิมไม่ได้');
      }
      throw err;
    }
    if (!restored) throw new AppError(409, 'MEMBERSHIP_NOT_DELETED', 'รายการนี้ไม่ได้ถูกลบ');
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'restored', note }, client);
  });
}

// ---------- คำเชิญเข้าชมรม ----------

/**
 * กรรมการ (club_member:approve) เชิญบุคลากรเป็นสมาชิก → ผู้ถูกเชิญตอบรับเอง (ไม่เพิ่มชื่อโดยเจ้าตัวไม่รู้ — PDPA)
 * ผู้ถูกเชิญต้องเคยเข้าสู่ระบบ ยังใช้งานได้ เป็นบุคลากร และยังไม่มีใบสมัคร/คำเชิญ/สมาชิกภาพในชมรมนี้
 */
export async function inviteMember(auth: AuthContext, clubId: string, userId: string, note: string | null): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.MEMBER_APPROVE))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการสมาชิกของชมรมนี้');
  }
  if (userId === auth.user.id) throw new AppError(422, 'CANNOT_INVITE_SELF', 'เชิญตัวเองไม่ได้');
  await withTransaction(async (client) => {
    await assertClubActive(clubId, client);
    const [user] = await findUserSummariesByIds([userId], client);
    if (!user || !user.isActive) throw new AppError(422, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้ (ต้องเคยเข้าสู่ระบบแล้ว)');
    if (!isEligibleForClub(user.email)) throw new AppError(422, 'USER_NOT_ELIGIBLE', 'เชิญได้เฉพาะบุคลากรของมหาวิทยาลัย');
    const current = await lockCurrentMembership(clubId, userId, client);
    if (current) {
      throw new AppError(409, 'ALREADY_RELATED', 'ผู้ใช้นี้เป็นสมาชิก มีใบสมัคร หรือได้รับคำเชิญจากชมรมนี้อยู่แล้ว');
    }
    let membershipId: string;
    try {
      membershipId = await insertInvitation(clubId, userId, auth.user.id, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'ALREADY_RELATED', 'ผู้ใช้นี้เป็นสมาชิก มีใบสมัคร หรือได้รับคำเชิญจากชมรมนี้อยู่แล้ว');
      }
      throw err;
    }
    const eventId = await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'invited', note }, client);
    await notifyMembershipInvited(client, membershipId, auth.user.name ?? auth.user.email, eventId);
  });
}

// ผู้ถูกเชิญตอบรับ (เป็นสมาชิกทันที) หรือปฏิเสธ — ต้อง login เท่านั้น ทำได้กับคำเชิญของตัวเอง
export async function respondToInvitation(auth: AuthContext, clubId: string, decision: 'accept' | 'decline'): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockCurrentMembership(clubId, auth.user.id, client);
    if (!current || current.status !== 'invited') {
      throw new AppError(404, 'INVITATION_NOT_FOUND', 'ไม่พบคำเชิญที่รอคุณตอบ');
    }
    if (decision === 'accept') await assertClubActive(clubId, client);
    await resolveInvitation(current.id, decision === 'accept' ? 'accepted' : 'declined', client);
    await insertMembershipEvent(
      { membershipId: current.id, actorUserId: auth.user.id, action: decision === 'accept' ? 'invite_accepted' : 'invite_declined', note: null },
      client,
    );
  });
}

// กรรมการยกเลิกคำเชิญที่ยังไม่ได้ตอบ
export async function cancelInvitation(auth: AuthContext, clubId: string, membershipId: string): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await lockForDecision(auth, clubId, membershipId, client);
    if (membership.status !== 'invited' || !(await resolveInvitation(membershipId, 'cancelled', client))) {
      throw new AppError(409, 'INVALID_STATUS', 'คำเชิญนี้ไม่ได้รอตอบแล้ว');
    }
    await insertMembershipEvent({ membershipId, actorUserId: auth.user.id, action: 'invite_cancelled', note: null }, client);
  });
}

// คำเชิญที่รอตอบของชมรม — route ตรวจสิทธิ์ชมรม club_member:approve แล้ว
export async function listInvitations(clubId: string) {
  return { items: await listClubInvitations(clubId) };
}

// คำเชิญที่รอฉันตอบ — ต้อง login เท่านั้น (ข้อมูลของตัวเอง)
export async function getMyInvitations(auth: AuthContext) {
  return { items: await listMyInvitations(auth.user.id) };
}
