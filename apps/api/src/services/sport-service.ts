import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import { findClubDetail, findCurrentMembershipStatus } from '../repositories/clubs-repository.js';
import { lockClubStatus, lockCurrentMembership } from '../repositories/memberships-repository.js';
import {
  clubHasSport,
  endAthlete,
  findActiveSportIds,
  findSportsWithAthletes,
  insertAthlete,
  insertSport,
  listClubAthletes,
  listClubSports,
  listSports,
  lockCurrentAthlete,
  replaceClubSports,
  updateAthleteEvent,
  updateSport,
} from '../repositories/sports-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { SPORTS_CATEGORY_CODE } from './club-rules.js';
import { PERMISSIONS } from './permissions.js';

function athleteNotFound(): AppError {
  return new AppError(404, 'ATHLETE_NOT_FOUND', 'ไม่พบการลงทะเบียนนักกีฬา');
}

// ---------- ชนิดกีฬา (ข้อมูลหลัก) ----------

// ต้อง login เท่านั้น: รายการชนิดกีฬาที่ใช้งาน (ผู้มี sport:manage เห็นที่ปิดใช้งานด้วย)
export async function getSports(auth: AuthContext) {
  return { items: await listSports(hasPermission(auth, PERMISSIONS.SPORT_MANAGE)) };
}

export async function createSport(auth: AuthContext, code: string, nameTh: string): Promise<string> {
  if (!hasPermission(auth, PERMISSIONS.SPORT_MANAGE)) throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการรายการชนิดกีฬา');
  try {
    return await withTransaction((client) => insertSport(code, nameTh, client));
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError(409, 'SPORT_CODE_TAKEN', 'รหัสชนิดกีฬานี้มีอยู่แล้ว');
    throw err;
  }
}

// แก้ชื่อ/ปิดใช้งาน (ไม่ลบ เพราะมีชมรมและนักกีฬาอ้างอิง)
export async function editSport(auth: AuthContext, id: string, nameTh: string, isActive: boolean): Promise<void> {
  if (!hasPermission(auth, PERMISSIONS.SPORT_MANAGE)) throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการรายการชนิดกีฬา');
  const updated = await withTransaction((client) => updateSport(id, nameTh, isActive, client));
  if (!updated) throw new AppError(404, 'SPORT_NOT_FOUND', 'ไม่พบชนิดกีฬา');
}

// ---------- ชนิดกีฬาของชมรม ----------

// ต้อง login เท่านั้น: ชนิดกีฬาของชมรม (enabled = ชมรมประเภทสุขภาพ กีฬาและนันทนาการ)
export async function getClubSports(clubId: string) {
  const club = await findClubDetail(clubId);
  if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  return { enabled: club.category.code === SPORTS_CATEGORY_CODE, items: await listClubSports(clubId) };
}

/**
 * เลือกชนิดกีฬาของชมรม (แทนที่ทั้งชุด) — สิทธิ์ชมรม club_sport:manage, เฉพาะชมรมประเภทกีฬา
 * เอาชนิดกีฬาที่ยังมีนักกีฬาออกไม่ได้ (ต้องให้นักกีฬาพ้นก่อน)
 */
export async function setClubSports(auth: AuthContext, clubId: string, sportIds: string[]): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.SPORT_MANAGE))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการกีฬาของชมรมนี้');
  }
  const club = await findClubDetail(clubId);
  if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  if (club.category.code !== SPORTS_CATEGORY_CODE) {
    throw new AppError(422, 'NOT_SPORTS_CLUB', 'เลือกชนิดกีฬาได้เฉพาะชมรมประเภทสุขภาพ กีฬาและนันทนาการ');
  }
  const unique = [...new Set(sportIds)];
  await withTransaction(async (client) => {
    await lockClubStatus(clubId, client);
    if ((await findActiveSportIds(unique, client)).length !== unique.length) {
      throw new AppError(422, 'SPORT_NOT_FOUND', 'มีชนิดกีฬาที่ไม่พบหรือปิดใช้งานแล้ว');
    }
    const blocked = await findSportsWithAthletes(clubId, unique, client);
    if (blocked.length > 0) {
      throw new AppError(409, 'SPORT_HAS_ATHLETES', `ยังมีนักกีฬาในชนิดกีฬา: ${blocked.join(', ')}`);
    }
    await replaceClubSports(clubId, unique, auth.user.id, client);
  });
}

// ---------- นักกีฬา ----------

// รายชื่อนักกีฬา (ข้อมูลภายใน): สมาชิก active ของชมรม และผู้มี club:view_internal — ไม่มีสิทธิ์ → 403
export async function getClubAthletes(auth: AuthContext, clubId: string) {
  const allowed =
    (await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.VIEW_INTERNAL)) ||
    (await findCurrentMembershipStatus(clubId, auth.user.id)) === 'active';
  if (!allowed) throw new AppError(403, 'FORBIDDEN', 'รายชื่อนักกีฬาดูได้เฉพาะสมาชิกชมรม');
  return { items: await listClubAthletes(clubId) };
}

// สมาชิก active ลงทะเบียนเป็นนักกีฬาของชนิดกีฬาที่ชมรมเลือกไว้ (ต้อง login เท่านั้น — ตรวจสมาชิกภาพใน service)
export async function registerAthlete(auth: AuthContext, clubId: string, sportId: string, eventOrPosition: string | null): Promise<string> {
  return withTransaction(async (client) => {
    const status = await lockClubStatus(clubId, client);
    if (!status) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
    if (status !== 'active') throw new AppError(409, 'CLUB_NOT_ACTIVE', 'ชมรมนี้ไม่ได้ดำเนินการอยู่');
    if ((await lockCurrentMembership(clubId, auth.user.id, client))?.status !== 'active') {
      throw new AppError(403, 'NOT_ACTIVE_MEMBER', 'ลงทะเบียนนักกีฬาได้เฉพาะสมาชิกของชมรม');
    }
    if (!(await clubHasSport(clubId, sportId, client))) {
      throw new AppError(422, 'SPORT_NOT_IN_CLUB', 'ชมรมนี้ไม่ได้เลือกชนิดกีฬานี้');
    }
    try {
      return await insertAthlete({ clubId, userId: auth.user.id, sportId, eventOrPosition }, client);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new AppError(409, 'ALREADY_ATHLETE', 'คุณลงทะเบียนกีฬาชนิดนี้ในชมรมนี้แล้ว');
      throw err;
    }
  });
}

// เจ้าตัว หรือผู้มี club_sport:manage ของชมรม
async function lockManageableAthlete(auth: AuthContext, id: string, client: DbClient) {
  const athlete = await lockCurrentAthlete(id, client);
  if (!athlete) throw athleteNotFound();
  if (athlete.userId !== auth.user.id && !(await hasClubPermission(auth, athlete.clubId, CLUB_PERMISSIONS.SPORT_MANAGE))) {
    throw athleteNotFound();
  }
  return athlete;
}

export async function updateAthlete(auth: AuthContext, id: string, eventOrPosition: string | null): Promise<void> {
  await withTransaction(async (client) => {
    await lockManageableAthlete(auth, id, client);
    await updateAthleteEvent(id, eventOrPosition, client);
  });
}

// เลิกเป็นนักกีฬา (เจ้าตัว) หรือให้พ้น (ผู้จัดการทีม) — เก็บเป็นประวัติ
export async function endAthleteStatus(auth: AuthContext, id: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockManageableAthlete(auth, id, client);
    await endAthlete(id, auth.user.id, client);
  });
}
