import { AppError } from '../errors.js';
import {
  findClubDetail,
  findCurrentMembershipStatus,
  findProposedClub,
  listClubs,
  listProposedClubs,
  listCurrentAdvisors,
  listCurrentCommittee,
} from '../repositories/clubs-repository.js';
import { findLatestRejection, findMyInvitation } from '../repositories/memberships-repository.js';
import { getMyResignation } from './membership-service.js';
import type { AuthContext } from './authorization.js';
import { getClubPermissions } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { PRESIDENT_POSITION_CODE } from './club-rules.js';
import { createFileViewUrl } from './files-service.js';
import { assertCanView } from './club-application-service.js';
import { findApplicationBase } from '../repositories/club-applications-repository.js';

export interface ClubListQuery {
  query: string | null;
  categoryCode: string | null;
  mineOnly: boolean;
  renewingOnly: boolean;
  page: number;
  pageSize: number;
}

// ทำเนียบชมรม: ทุกคนที่ login ดูได้ (ข้อมูลสาธารณะของชมรม)
export async function listClubDirectory(auth: AuthContext, input: ClubListQuery) {
  const { items, total } = await listClubs({
    query: input.query,
    categoryCode: input.categoryCode,
    mineOnly: input.mineOnly,
    renewingOnly: input.renewingOnly,
    userId: auth.user.id,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  }, PRESIDENT_POSITION_CODE);
  return { items, total, page: input.page, pageSize: input.pageSize };
}

// ---------- ชมรมที่อยู่ระหว่างขอจัดตั้ง ----------

// ต้อง login เท่านั้น: คำขอจัดตั้งที่ยื่นต่อสโมสรแล้ว (ข้อมูลแนะนำชมรม — ผู้ใช้ยืนยันให้เปิดเผยแล้ว)
export async function listProposedClubDirectory(input: { query: string | null; categoryCode: string | null; page: number; pageSize: number }) {
  const { items, total } = await listProposedClubs(
    { query: input.query, categoryCode: input.categoryCode, limit: input.pageSize, offset: (input.page - 1) * input.pageSize },
    PRESIDENT_POSITION_CODE,
  );
  return { items, total, page: input.page, pageSize: input.pageSize };
}

function proposedNotFound(): AppError {
  return new AppError(404, 'PROPOSED_CLUB_NOT_FOUND', 'ไม่พบชมรมที่อยู่ระหว่างขอจัดตั้ง');
}

/**
 * หน้าสรุปสาธารณะของชมรมที่อยู่ระหว่างขอจัดตั้ง (ต้อง login เท่านั้น): ตรา ชื่อ ประเภท คำขวัญ วัตถุประสงค์ ประธาน สถานะ
 * ไม่มีข้อมูลติดต่อ รายชื่อสมาชิก หรือเอกสาร — canViewApplication บอกว่าผู้ใช้ดูคำขอฉบับเต็มได้หรือไม่ (ผู้ยื่น/เจ้าหน้าที่ ฯลฯ)
 */
export async function getProposedClub(auth: AuthContext, applicationId: string) {
  const club = await findProposedClub(applicationId, PRESIDENT_POSITION_CODE);
  if (!club) throw proposedNotFound();
  const base = await findApplicationBase(applicationId);
  let canViewApplication = false;
  if (base) {
    try {
      await assertCanView(auth, base);
      canViewApplication = true;
    } catch (err) {
      // ไม่มีสิทธิ์ดูคำขอฉบับเต็ม (404) = แสดงเฉพาะหน้าสรุป, error อื่นโยนต่อ
      if (!(err instanceof AppError && err.status === 404)) throw err;
    }
  }
  return { ...club, canViewApplication };
}

// ตราของชมรมที่อยู่ระหว่างขอจัดตั้ง (ต้อง login เท่านั้น เฉพาะคำขอที่เปิดเผยในทำเนียบ)
export async function getProposedClubLogoUrl(applicationId: string): Promise<string> {
  const club = await findProposedClub(applicationId, PRESIDENT_POSITION_CODE);
  if (!club) throw proposedNotFound();
  const url = club.logoFileId ? await createFileViewUrl(club.logoFileId) : null;
  if (!url) throw new AppError(404, 'LOGO_NOT_FOUND', 'ชมรมนี้ยังไม่มีตราสัญลักษณ์');
  return url;
}

/**
 * หน้าชมรม: ข้อมูลสาธารณะสำหรับทุกคนที่ login
 * ข้อมูลภายใน (เบอร์โทร/สถานที่ทำงานของกรรมการ, ช่องทางติดต่อที่ปรึกษา) เฉพาะผู้มี club:view_internal
 * พร้อมบอกสถานะของผู้ใช้ในชมรม (สมาชิก/ตำแหน่ง/สิทธิ์ชมรม) ให้หน้าจอเลือกแสดงปุ่ม
 */
export async function getClubPage(auth: AuthContext, clubId: string) {
  const club = await findClubDetail(clubId);
  if (!club) {
    throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  }
  const [permissions, committee, advisors, membershipStatus] = await Promise.all([
    getClubPermissions(auth, clubId),
    listCurrentCommittee(clubId),
    listCurrentAdvisors(clubId),
    findCurrentMembershipStatus(clubId, auth.user.id),
  ]);
  const internal = (permissions ?? []).includes(CLUB_PERMISSIONS.VIEW_INTERNAL);
  // ใบสมัครล่าสุดถูกปฏิเสธ → แสดงเหตุผลให้ผู้สมัครเห็น (ข้อมูลของตัวเอง)
  const rejection = membershipStatus === null ? await findLatestRejection(clubId, auth.user.id) : null;
  // คำขอลาออกของฉันที่ยังไม่มีผล
  const resignation = membershipStatus === 'active' ? await getMyResignation(clubId, auth.user.id) : null;
  // คำเชิญเข้าชมรมที่รอฉันตอบ
  const invitation = membershipStatus === null ? await findMyInvitation(clubId, auth.user.id) : null;

  return {
    ...club,
    committee: committee.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: c.name ?? c.email,
      orgUnitName: c.orgUnitName,
      positionCode: c.positionCode,
      positionTitle: c.positionTitle,
      startedOn: c.startedOn,
      ...(internal ? { email: c.email, contactPhone: c.contactPhone, workLocation: c.workLocation } : {}),
    })),
    advisors: advisors.map((a) => ({
      kind: a.kind,
      name: a.name,
      organization: a.organization,
      position: a.position,
      ...(internal ? { email: a.email, phone: a.phone } : {}),
    })),
    me: {
      membershipStatus,
      rejection,
      resignation,
      invitation,
      positions: committee.filter((c) => c.userId === auth.user.id).map((c) => c.positionTitle),
      isAdvisor: advisors.some((a) => a.userId === auth.user.id),
      permissions: permissions ?? [],
    },
  };
}


