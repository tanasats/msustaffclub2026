import { AppError } from '../errors.js';
import {
  findMemberPerson,
  insertMemberExportLog,
  MEMBER_EXPORT_LIMIT,
  listMemberAchievements,
  listMemberActivities,
  listMemberCompetitionResults,
  listMemberPositions,
  listMembershipHistory,
  searchClubMembers,
  type MemberSearchFilter,
} from '../repositories/club-members-repository.js';
import type { AuthContext } from './authorization.js';
import { canManageDeletedMemberships } from './membership-service.js';
import { toCsv } from './csv.js';

// รายชื่อสมาชิกและข้อมูลรายบุคคล — route ตรวจสิทธิ์ชมรม club:view_internal ด้วย requireClubPermission แล้ว

export interface MemberListQuery extends Omit<MemberSearchFilter, 'limit' | 'offset'> {
  page: number;
  pageSize: number;
}

export async function listMembers(auth: AuthContext, input: MemberListQuery) {
  const { page, pageSize, ...filter } = input;
  if (filter.status === 'deleted' && !canManageDeletedMemberships(auth)) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูรายชื่อที่ถูกลบ');
  }
  const { items, total } = await searchClubMembers({ ...filter, limit: pageSize, offset: (page - 1) * pageSize });
  return { items, total, page, pageSize };
}

/**
 * ข้อมูลรายบุคคลของสมาชิกในชมรมนี้: สมาชิกภาพล่าสุด ประวัติ ตำแหน่ง ผลงาน กิจกรรม และผลการแข่งขัน (เฉพาะในชมรมนี้)
 * ต้องเคยสมัคร/เป็นสมาชิกชมรมนี้ ไม่เช่นนั้นตอบ 404 (ไม่ใช้หน้านี้ดูข้อมูลของบุคลากรที่ไม่เกี่ยวข้องกับชมรม)
 */
export async function getMemberProfile(auth: AuthContext, clubId: string, userId: string) {
  // ผู้มีสิทธิ์ดูรายการที่ลบ เห็นรายการที่ลบและประวัติของรายการนั้นด้วย
  const includeDeleted = canManageDeletedMemberships(auth);
  const person = await findMemberPerson(clubId, userId, includeDeleted);
  if (!person || person.membershipId === null) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'ไม่พบสมาชิกคนนี้ในชมรม');
  }
  const [history, positions, achievements, activities, competitionResults] = await Promise.all([
    listMembershipHistory(clubId, userId, includeDeleted),
    listMemberPositions(clubId, userId),
    listMemberAchievements(clubId, userId),
    listMemberActivities(clubId, userId),
    listMemberCompetitionResults(clubId, userId),
  ]);
  return { person, history, positions, achievements, activities, competitionResults };
}

const STATUS_TH: Record<string, string> = { active: 'สมาชิก', ended: 'พ้นสภาพ' };
const END_REASON_TH: Record<string, string> = {
  resigned: 'ลาออก',
  left_university: 'ลาออกจากมหาวิทยาลัย',
  disciplinary: 'ต้องโทษวินัย',
  removed_by_resolution: 'มติที่ประชุมคณะกรรมการให้ออก',
  deceased: 'ถึงแก่กรรม',
  club_dissolved: 'ชมรมถูกยุบ',
};
// วันที่แบบไทย (พ.ศ.) ตามเวลาประเทศไทย เช่น 1/10/2569
const thaiDate = (value: Date | string | null) =>
  value ? new Date(value).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) : null;

export type MemberExportFilter = Omit<MemberSearchFilter, 'clubId' | 'limit' | 'offset'>;

/**
 * ส่งออกรายชื่อสมาชิกเป็น CSV ตามตัวกรองเดียวกับหน้ารายชื่อ — route ตรวจสิทธิ์ชมรม club_member:approve แล้ว
 * คอลัมน์เท่าที่จำเป็น (ไม่มีเบอร์โทร) และบันทึกการส่งออกทุกครั้ง (PDPA)
 */
export async function exportMembers(auth: AuthContext, clubId: string, filter: MemberExportFilter): Promise<string> {
  if (filter.status === 'deleted') throw new AppError(422, 'EXPORT_NOT_ALLOWED', 'ส่งออกรายชื่อที่ถูกลบไม่ได้');
  const { items, total } = await searchClubMembers({ clubId, ...filter, limit: MEMBER_EXPORT_LIMIT, offset: 0 });
  if (total > MEMBER_EXPORT_LIMIT) {
    throw new AppError(422, 'EXPORT_TOO_LARGE', `ส่งออกได้ครั้งละไม่เกิน ${MEMBER_EXPORT_LIMIT} คน กรุณาเพิ่มตัวกรอง`);
  }
  const csv = toCsv(
    ['ลำดับ', 'ชื่อ-สกุล', 'อีเมล', 'หน่วยงาน', 'สถานะ', 'ตำแหน่งกรรมการ', 'วันที่เป็นสมาชิก', 'วันที่พ้นสภาพ', 'เหตุพ้นสภาพ'],
    items.map((m, i) => [
      i + 1,
      m.name,
      m.email,
      m.orgUnitName,
      STATUS_TH[m.status] ?? m.status,
      m.positionTitle,
      thaiDate(m.joinedAt),
      m.endedOn ? thaiDate(`${m.endedOn}T00:00:00+07:00`) : null,
      m.endReason ? (END_REASON_TH[m.endReason] ?? m.endReason) : null,
    ]),
  );
  await insertMemberExportLog({
    clubId,
    exportedBy: auth.user.id,
    filter: { status: filter.status, role: filter.role, query: filter.query },
    rowCount: items.length,
  });
  return csv;
}
