import { AppError } from '../errors.js';
import {
  findMemberPerson,
  listMemberAchievements,
  listMemberActivities,
  listMemberCompetitionResults,
  listMemberPositions,
  listMembershipHistory,
  searchClubMembers,
  type MemberSearchFilter,
} from '../repositories/club-members-repository.js';

// รายชื่อสมาชิกและข้อมูลรายบุคคล — route ตรวจสิทธิ์ชมรม club:view_internal ด้วย requireClubPermission แล้ว

export interface MemberListQuery extends Omit<MemberSearchFilter, 'limit' | 'offset'> {
  page: number;
  pageSize: number;
}

export async function listMembers(input: MemberListQuery) {
  const { page, pageSize, ...filter } = input;
  const { items, total } = await searchClubMembers({ ...filter, limit: pageSize, offset: (page - 1) * pageSize });
  return { items, total, page, pageSize };
}

/**
 * ข้อมูลรายบุคคลของสมาชิกในชมรมนี้: สมาชิกภาพล่าสุด ประวัติ ตำแหน่ง ผลงาน กิจกรรม และผลการแข่งขัน (เฉพาะในชมรมนี้)
 * ต้องเคยสมัคร/เป็นสมาชิกชมรมนี้ ไม่เช่นนั้นตอบ 404 (ไม่ใช้หน้านี้ดูข้อมูลของบุคลากรที่ไม่เกี่ยวข้องกับชมรม)
 */
export async function getMemberProfile(clubId: string, userId: string) {
  const person = await findMemberPerson(clubId, userId);
  if (!person || person.membershipId === null) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'ไม่พบสมาชิกคนนี้ในชมรม');
  }
  const [history, positions, achievements, activities, competitionResults] = await Promise.all([
    listMembershipHistory(clubId, userId),
    listMemberPositions(clubId, userId),
    listMemberAchievements(clubId, userId),
    listMemberActivities(clubId, userId),
    listMemberCompetitionResults(clubId, userId),
  ]);
  return { person, history, positions, achievements, activities, competitionResults };
}
