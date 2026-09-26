import { withTransaction, type DbClient } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  findActiveStatIdsOfSport,
  findAthleteSummary,
  findCompetition,
  findNonAthletes,
  insertCompetition,
  insertStatDefinition,
  listAthleteCompetitions,
  listBestStats,
  listCompetitions,
  listResults,
  listStatDefinitions,
  lockCompetition,
  replaceResults,
  softDeleteCompetition,
  updateCompetition,
  updateStatDefinition,
  type CompetitionFields,
  type ResultInput,
} from '../repositories/competitions-repository.js';
import { clubHasSport, listClubAthletes } from '../repositories/sports-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { hasClubPermission } from './club-authorization.js';
import { CLUB_PERMISSIONS } from './club-permissions.js';
import { bangkokDateString, fiscalYearRange } from './fiscal-year.js';
import { PERMISSIONS } from './permissions.js';

export interface CompetitionInput extends CompetitionFields {
  results: ResultInput[];
}

function competitionNotFound(): AppError {
  return new AppError(404, 'COMPETITION_NOT_FOUND', 'ไม่พบการแข่งขัน');
}

// ---------- ค่าสถิติของชนิดกีฬา (permission ระบบ sport:manage) ----------

export async function getStatDefinitions(auth: AuthContext, sportId: string) {
  return { items: await listStatDefinitions(sportId, hasPermission(auth, PERMISSIONS.SPORT_MANAGE)) };
}

function assertSportManager(auth: AuthContext): void {
  if (!hasPermission(auth, PERMISSIONS.SPORT_MANAGE)) throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการค่าสถิติของชนิดกีฬา');
}

export async function createStatDefinition(
  auth: AuthContext,
  sportId: string,
  input: { code: string; nameTh: string; unit: string | null; better: 'higher' | 'lower' },
): Promise<string> {
  assertSportManager(auth);
  try {
    return await withTransaction((client) => insertStatDefinition(sportId, input, client));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') throw new AppError(409, 'STAT_CODE_TAKEN', 'รหัสค่าสถิตินี้มีอยู่แล้วในชนิดกีฬานี้');
    if (code === '23503') throw new AppError(404, 'SPORT_NOT_FOUND', 'ไม่พบชนิดกีฬา');
    throw err;
  }
}

export async function editStatDefinition(
  auth: AuthContext,
  id: string,
  input: { nameTh: string; unit: string | null; better: 'higher' | 'lower'; isActive: boolean },
): Promise<void> {
  assertSportManager(auth);
  if (!(await withTransaction((client) => updateStatDefinition(id, input, client)))) {
    throw new AppError(404, 'STAT_NOT_FOUND', 'ไม่พบค่าสถิติ');
  }
}

// ---------- การแข่งขัน (สิทธิ์ชมรม club_sport:manage) ----------

async function assertCanManage(auth: AuthContext, clubId: string): Promise<void> {
  if (!(await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.SPORT_MANAGE))) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์บันทึกการแข่งขันของชมรมนี้');
  }
}

/**
 * ตรวจข้อมูลการแข่งขัน: ชนิดกีฬาเป็นของชมรม, วันที่ไม่เกินวันนี้,
 * ผู้เข้าแข่งเป็นนักกีฬาปัจจุบันของชนิดกีฬานั้นในชมรม (ไม่ซ้ำ), ค่าสถิติเป็นของชนิดกีฬานั้นและไม่ซ้ำในคนเดียวกัน
 */
async function validate(clubId: string, input: CompetitionInput, client: DbClient): Promise<void> {
  if (!(await clubHasSport(clubId, input.sportId, client))) {
    throw new AppError(422, 'SPORT_NOT_IN_CLUB', 'ชมรมนี้ไม่ได้เลือกชนิดกีฬานี้');
  }
  if (input.heldFrom > bangkokDateString()) {
    throw new AppError(422, 'HELD_IN_FUTURE', 'บันทึกผลการแข่งขันที่ยังไม่เกิดขึ้นไม่ได้');
  }
  const userIds = input.results.map((r) => r.userId);
  if (new Set(userIds).size !== userIds.length) throw new AppError(422, 'DUPLICATE_ATHLETE', 'มีนักกีฬาซ้ำในผลการแข่งขัน');
  if (userIds.length > 0 && (await findNonAthletes(clubId, input.sportId, userIds, client)).length > 0) {
    throw new AppError(422, 'NOT_AN_ATHLETE', 'ผู้เข้าแข่งต้องเป็นนักกีฬาของชนิดกีฬานี้ในชมรม');
  }
  for (const result of input.results) {
    const statIds = result.stats.map((s) => s.statId);
    if (new Set(statIds).size !== statIds.length) throw new AppError(422, 'DUPLICATE_STAT', 'มีค่าสถิติซ้ำในนักกีฬาคนเดียวกัน');
  }
  const allStatIds = [...new Set(input.results.flatMap((r) => r.stats.map((s) => s.statId)))];
  if (allStatIds.length > 0 && (await findActiveStatIdsOfSport(input.sportId, allStatIds, client)).length !== allStatIds.length) {
    throw new AppError(422, 'STAT_NOT_FOUND', 'มีค่าสถิติที่ไม่ใช่ของชนิดกีฬานี้หรือปิดใช้งานแล้ว');
  }
}

export async function recordCompetition(auth: AuthContext, clubId: string, input: CompetitionInput): Promise<string> {
  await assertCanManage(auth, clubId);
  return withTransaction(async (client) => {
    await validate(clubId, input, client);
    const id = await insertCompetition(clubId, input, auth.user.id, client);
    await replaceResults(id, input.results, client);
    return id;
  });
}

async function lockManaged(auth: AuthContext, id: string, client: DbClient) {
  const competition = await lockCompetition(id, client);
  if (!competition) throw competitionNotFound();
  await assertCanManage(auth, competition.clubId);
  return competition;
}

export async function editCompetition(auth: AuthContext, id: string, input: CompetitionInput): Promise<void> {
  await withTransaction(async (client) => {
    const competition = await lockManaged(auth, id, client);
    await validate(competition.clubId, input, client);
    await updateCompetition(id, input, client);
    await replaceResults(id, input.results, client);
  });
}

export async function deleteCompetition(auth: AuthContext, id: string): Promise<void> {
  await withTransaction(async (client) => {
    await lockManaged(auth, id, client);
    await softDeleteCompetition(id, client);
  });
}

// ---------- อ่าน ----------

// ต้อง login เท่านั้น: การแข่งขันของชมรมในปีงบประมาณ (อันดับ/เหรียญเป็นข้อมูลสาธารณะ)
export async function getClubCompetitions(clubId: string, fiscalYear: number) {
  const { start, end } = fiscalYearRange(fiscalYear);
  return { fiscalYear, items: await listCompetitions(clubId, start, end) };
}

/**
 * รายละเอียดการแข่งขัน: ทุกคนที่ login เห็นอันดับ/เหรียญ
 * ค่าสถิติรายบุคคลเห็นเฉพาะของตัวเอง หรือทั้งหมดถ้ามี club:view_internal ของชมรม (ยืนยันแล้ว ข้อ 5)
 */
export async function getCompetition(auth: AuthContext, id: string) {
  const competition = await findCompetition(id);
  if (!competition) throw competitionNotFound();
  const [results, internal, canManage] = await Promise.all([
    listResults(id),
    hasClubPermission(auth, competition.clubId, CLUB_PERMISSIONS.VIEW_INTERNAL),
    hasClubPermission(auth, competition.clubId, CLUB_PERMISSIONS.SPORT_MANAGE),
  ]);
  return {
    ...competition,
    results: results.map(({ stats, ...rest }) => ({
      ...rest,
      ...(internal || rest.userId === auth.user.id ? { stats } : {}),
    })),
    me: { canManage },
  };
}

/**
 * สรุปนักกีฬาในชมรม: จำนวนแข่ง เหรียญ สถิติดีที่สุด การเข้าร่วมกิจกรรม และประวัติการแข่งขัน
 * เห็นได้เฉพาะตัวนักกีฬาเอง และผู้มี club:view_internal ของชมรม (ไม่มีสิทธิ์ → 404)
 */
export async function getAthleteSummary(auth: AuthContext, clubId: string, userId: string) {
  const allowed = userId === auth.user.id || (await hasClubPermission(auth, clubId, CLUB_PERMISSIONS.VIEW_INTERNAL));
  if (!allowed) throw new AppError(404, 'ATHLETE_NOT_FOUND', 'ไม่พบข้อมูลนักกีฬา');
  const [summary, bestStats, competitions, athletes] = await Promise.all([
    findAthleteSummary(clubId, userId),
    listBestStats(clubId, userId),
    listAthleteCompetitions(clubId, userId),
    listClubAthletes(clubId),
  ]);
  const registrations = athletes.filter((a) => a.userId === userId);
  if (registrations.length === 0 && summary.competitionCount === 0) {
    throw new AppError(404, 'ATHLETE_NOT_FOUND', 'ไม่พบข้อมูลนักกีฬา');
  }
  return {
    userId,
    name: registrations[0]?.name ?? null,
    registrations: registrations.map((r) => ({ id: r.id, sportName: r.sportName, eventOrPosition: r.eventOrPosition, since: r.since })),
    summary,
    bestStats,
    competitions,
  };
}
