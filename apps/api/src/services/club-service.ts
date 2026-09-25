import { AppError } from '../errors.js';
import {
  findClubDetail,
  findCurrentMembershipStatus,
  listActiveMembers,
  listClubs,
  listCurrentAdvisors,
  listCurrentCommittee,
} from '../repositories/clubs-repository.js';
import type { AuthContext } from './authorization.js';
import { getClubPermissions } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';

export interface ClubListQuery {
  query: string | null;
  categoryCode: string | null;
  mineOnly: boolean;
  page: number;
  pageSize: number;
}

// ทำเนียบชมรม: ทุกคนที่ login ดูได้ (ข้อมูลสาธารณะของชมรม)
export async function listClubDirectory(auth: AuthContext, input: ClubListQuery) {
  const { items, total } = await listClubs({
    query: input.query,
    categoryCode: input.categoryCode,
    mineOnly: input.mineOnly,
    userId: auth.user.id,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  });
  return { items, total, page: input.page, pageSize: input.pageSize };
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

  return {
    ...club,
    committee: committee.map((c) => ({
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
      positions: committee.filter((c) => c.userId === auth.user.id).map((c) => c.positionTitle),
      isAdvisor: advisors.some((a) => a.userId === auth.user.id),
      permissions: permissions ?? [],
    },
  };
}

// รายชื่อสมาชิก (ข้อมูลภายใน) — route ตรวจ club:view_internal ด้วย requireClubPermission แล้ว
export async function listClubMembers(clubId: string, page: number, pageSize: number) {
  const { items, total } = await listActiveMembers(clubId, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}
