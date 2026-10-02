import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { endCommitteeMember, insertCommitteeEvent } from '../repositories/committee-repository.js';
import { endMembership, insertMembershipEvent, resolveInvitation, withdrawMembership } from '../repositories/memberships-repository.js';
import { lockRoleByCode } from '../repositories/roles-repository.js';
import { endAthletesOfMember } from '../repositories/sports-repository.js';
import { countActiveUsersWithRole } from '../repositories/user-roles-repository.js';
import {
  deleteAllSessionsOfUser,
  endAdvisorshipsOfUser,
  insertAccountEvent,
  listAccountEvents,
  listCurrentAdvisorshipsOfUser,
  listCurrentCommitteeOfUser,
  listCurrentMembershipsOfUser,
  lockAccount,
  setAccountActive,
} from '../repositories/user-accounts-repository.js';
import type { AuthContext } from './authorization.js';
import { PRESIDENT_POSITION_CODE } from './club-rules.js';
import { bangkokDateString } from './fiscal-year.js';
import { SYSTEM_ROLES } from './permissions.js';

// ปิด/เปิดบัญชีผู้ใช้ที่พ้นจากมหาวิทยาลัย — route ตรวจ permission user_account:deactivate แล้ว (ไม่ผูก role → super_admin)

function userNotFound(): AppError {
  return new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
}

/**
 * ผลที่จะเกิดถ้าปิดบัญชี (แสดงก่อนยืนยัน): สมาชิกภาพ/ใบสมัคร/คำเชิญ, ตำแหน่งกรรมการ (ระบุชมรมที่จะไม่มีประธาน), ที่ปรึกษา
 */
export async function getAccountOverview(userId: string) {
  const [memberships, committee, advisorships, history] = await Promise.all([
    listCurrentMembershipsOfUser(userId),
    listCurrentCommitteeOfUser(userId),
    listCurrentAdvisorshipsOfUser(userId),
    listAccountEvents(userId),
  ]);
  return {
    effects: {
      memberships,
      committee: committee.map((c) => ({ ...c, isPresident: c.positionCode === PRESIDENT_POSITION_CODE })),
      advisorships,
    },
    history,
  };
}

/**
 * ปิดบัญชีผู้พ้นจากมหาวิทยาลัย (ระเบียบข้อ 20(2)) ใน transaction เดียว:
 * - ปิดบัญชี + ออกจากระบบทุกอุปกรณ์
 * - ตำแหน่งกรรมการทุกชมรมสิ้นสุด (เหตุ left_university) — ชมรมที่ไม่มีประธานแล้ว ผู้มี club:manage_all โอนตำแหน่งประธานให้ผู้อื่นได้
 * - สมาชิกภาพ active → พ้นสภาพ (left_university) และสิ้นสุดการเป็นนักกีฬา, ใบสมัครที่รอ → ยกเลิก, คำเชิญที่รอ → ยกเลิก
 * - การเป็นที่ปรึกษาทุกชมรมสิ้นสุด
 * - บันทึก user_account_events และ event ของแต่ละรายการ
 * ห้ามปิดบัญชีตัวเอง และห้ามปิดบัญชีผู้ดูแลระบบสูงสุดคนสุดท้าย
 */
export async function deactivateAccount(auth: AuthContext, userId: string, reason: string) {
  if (userId === auth.user.id) throw new AppError(403, 'CANNOT_DEACTIVATE_SELF', 'ปิดบัญชีของตนเองไม่ได้');
  return withTransaction(async (client) => {
    // ล็อก role super_admin ก่อน เพื่อให้การนับผู้ดูแลระบบที่เหลือไม่ถูกรายการอื่นแทรก
    const superAdmin = await lockRoleByCode(SYSTEM_ROLES.SUPER_ADMIN, client);
    const account = await lockAccount(userId, client);
    if (!account) throw userNotFound();
    if (!account.isActive) throw new AppError(409, 'ALREADY_INACTIVE', 'บัญชีนี้ถูกปิดอยู่แล้ว');

    const today = bangkokDateString();
    const note = `พ้นจากมหาวิทยาลัย: ${reason}`;

    await setAccountActive(userId, false, client);
    if (superAdmin && (await countActiveUsersWithRole(superAdmin.id, client)) === 0) {
      throw new AppError(409, 'LAST_SUPER_ADMIN', 'ปิดบัญชีผู้ดูแลระบบสูงสุดคนสุดท้ายไม่ได้');
    }
    await deleteAllSessionsOfUser(userId, client);

    const committee = await listCurrentCommitteeOfUser(userId, client);
    for (const position of committee) {
      await endCommitteeMember(position.id, today, 'left_university', client);
      await insertCommitteeEvent({ committeeMemberId: position.id, actorUserId: auth.user.id, action: 'ended', note }, client);
    }

    const memberships = await listCurrentMembershipsOfUser(userId, client);
    let ended = 0;
    for (const m of memberships) {
      if (m.status === 'active') {
        await endMembership(m.id, today, 'left_university', client);
        await endAthletesOfMember(m.clubId, userId, auth.user.id, client);
        await insertMembershipEvent({ membershipId: m.id, actorUserId: auth.user.id, action: 'removed', note }, client);
        ended += 1;
      } else if (m.status === 'pending') {
        await withdrawMembership(m.id, client);
        await insertMembershipEvent({ membershipId: m.id, actorUserId: auth.user.id, action: 'withdrawn', note }, client);
      } else {
        await resolveInvitation(m.id, 'cancelled', client);
        await insertMembershipEvent({ membershipId: m.id, actorUserId: auth.user.id, action: 'invite_cancelled', note }, client);
      }
    }

    const advisorships = await endAdvisorshipsOfUser(userId, today, client);
    const effects = {
      membershipsEnded: ended,
      applicationsWithdrawn: memberships.filter((m) => m.status !== 'active').length,
      committeePositionsEnded: committee.length,
      advisorshipsEnded: advisorships,
    };
    await insertAccountEvent({ userId, actorUserId: auth.user.id, action: 'deactivated', reason, effects }, client);
    return {
      effects,
      // ชมรมที่ไม่มีประธานแล้ว — ให้ผู้มี club:manage_all โอนตำแหน่งประธาน
      clubsWithoutPresident: committee.filter((c) => c.positionCode === PRESIDENT_POSITION_CODE).map((c) => ({ clubId: c.clubId, clubName: c.clubName })),
    };
  });
}

/**
 * เปิดบัญชีคืน (เช่น ปิดผิดคน หรือกลับมาทำงาน) — สมาชิกภาพ/ตำแหน่งที่สิ้นสุดไปแล้วไม่คืนอัตโนมัติ
 * (เจ้าตัวสมัครใหม่ / กรรมการแต่งตั้งใหม่ตามขั้นตอนปกติ เพื่อให้มีหลักฐานครบ)
 */
export async function reactivateAccount(auth: AuthContext, userId: string, reason: string): Promise<void> {
  await withTransaction(async (client) => {
    const account = await lockAccount(userId, client);
    if (!account) throw userNotFound();
    if (account.isActive) throw new AppError(409, 'ALREADY_ACTIVE', 'บัญชีนี้ใช้งานได้อยู่แล้ว');
    await setAccountActive(userId, true, client);
    await insertAccountEvent({ userId, actorUserId: auth.user.id, action: 'reactivated', reason, effects: {} }, client);
  });
}
