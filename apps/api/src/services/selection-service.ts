import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  closeRound,
  findRound,
  insertRound,
  listAnnouncedResults,
  listClosedRounds,
  listRanking,
  listRounds,
  lockRound,
  upsertDecision,
  type RoundInput,
  type SelectionDecision,
} from '../repositories/selections-repository.js';
import { findActiveSportIds } from '../repositories/sports-repository.js';
import { hasPermission, type AuthContext } from './authorization.js';
import { fiscalYearOf, fiscalYearRange } from './fiscal-year.js';
import { PERMISSIONS } from './permissions.js';

function roundNotFound(): AppError {
  return new AppError(404, 'ROUND_NOT_FOUND', 'ไม่พบรอบคัดเลือก');
}

// permission ระบบ sport_selection:manage (ผูกกับ role คณะกรรมการคัดเลือก — super_admin ผ่านทุก permission)
function assertManager(auth: AuthContext): void {
  if (!hasPermission(auth, PERMISSIONS.SPORT_SELECTION_MANAGE)) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์จัดการการคัดเลือก');
  }
}

export async function getRounds(auth: AuthContext) {
  assertManager(auth);
  return { items: await listRounds() };
}

// เปิดรอบคัดเลือก: ตัวแทนต้องระบุชนิดกีฬา รางวัลไม่ระบุ; ปีงบประมาณ = ปีนี้หรือปีที่แล้ว
export async function createRound(auth: AuthContext, input: RoundInput): Promise<string> {
  assertManager(auth);
  const current = fiscalYearOf();
  if (input.fiscalYear !== current && input.fiscalYear !== current - 1) {
    throw new AppError(422, 'FISCAL_YEAR_OUT_OF_RANGE', 'ใช้ข้อมูลได้เฉพาะปีงบประมาณปัจจุบันหรือปีที่แล้ว');
  }
  if ((input.kind === 'representative') !== (input.sportId !== null)) {
    throw new AppError(422, 'SPORT_REQUIRED', 'การคัดเลือกตัวแทนต้องระบุชนิดกีฬา (รางวัลไม่ต้องระบุ)');
  }
  return withTransaction(async (client) => {
    if (input.sportId && (await findActiveSportIds([input.sportId], client)).length === 0) {
      throw new AppError(422, 'SPORT_NOT_FOUND', 'ไม่พบชนิดกีฬา');
    }
    return insertRound(input, auth.user.id, client);
  });
}

// รอบ + ตารางจัดอันดับผู้เข้าชิง (ข้อมูลภายใน เฉพาะผู้คัดเลือก)
export async function getRound(auth: AuthContext, id: string) {
  assertManager(auth);
  const round = await findRound(id);
  if (!round) throw roundNotFound();
  const { start, end } = fiscalYearRange(round.fiscalYear);
  return { ...round, candidates: await listRanking(round.sportId, start, end, round.id, null) };
}

/**
 * บันทึกผลการตัดสินของผู้เข้าชิง (ต้องมีเหตุผล) — เปลี่ยนได้จนกว่าจะปิดรอบ
 * ต้องเป็นผู้เข้าชิงของรอบนี้ (คำนวณจากเงื่อนไขเดียวกับตารางจัดอันดับ)
 */
export async function decide(auth: AuthContext, roundId: string, userId: string, decision: SelectionDecision, reason: string): Promise<void> {
  assertManager(auth);
  await withTransaction(async (client) => {
    const round = await lockRound(roundId, client);
    if (!round) throw roundNotFound();
    if (round.status !== 'open') throw new AppError(409, 'ROUND_CLOSED', 'รอบคัดเลือกนี้ปิดแล้ว');
    const { start, end } = fiscalYearRange(round.fiscalYear);
    if ((await listRanking(round.sportId, start, end, roundId, userId, client)).length === 0) {
      throw new AppError(422, 'NOT_A_CANDIDATE', 'ผู้ใช้นี้ไม่ใช่ผู้เข้าชิงของรอบนี้');
    }
    await upsertDecision(roundId, userId, decision, reason, auth.user.id, client);
  });
}

// ปิดรอบ (ต้องมีผู้ได้รับคัดเลือกอย่างน้อย 1 คน) ปิดแล้วแก้ไม่ได้ และประกาศผลให้ทุกคนที่ login เห็น
export async function close(auth: AuthContext, roundId: string): Promise<void> {
  assertManager(auth);
  await withTransaction(async (client) => {
    const round = await lockRound(roundId, client);
    if (!round) throw roundNotFound();
    if (round.status !== 'open') throw new AppError(409, 'ROUND_CLOSED', 'รอบคัดเลือกนี้ปิดแล้ว');
    const detail = await findRound(roundId, client);
    if (!detail || detail.selectedCount === 0) {
      throw new AppError(422, 'NO_SELECTION', 'ต้องมีผู้ได้รับคัดเลือกอย่างน้อย 1 คนก่อนปิดรอบ');
    }
    await closeRound(roundId, auth.user.id, client);
  });
}

// ต้อง login เท่านั้น: ประกาศผล (เฉพาะรอบที่ปิดแล้ว, เฉพาะคัดเลือก/สำรอง ไม่แสดงตัวชี้วัด)
export async function getAnnouncement(roundId: string) {
  const round = await findRound(roundId);
  if (!round || round.status !== 'closed') throw roundNotFound();
  const { decidedCount: _decided, selectedCount: _selected, criteria, ...rest } = round;
  return { ...rest, criteria, results: await listAnnouncedResults(roundId) };
}

// ต้อง login เท่านั้น: รายการประกาศผล (รอบที่ปิดแล้ว ไม่รวมตัวชี้วัด)
export async function getAnnouncements() {
  const rounds = await listClosedRounds();
  return {
    items: rounds.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      sportName: r.sportName,
      eventName: r.eventName,
      fiscalYear: r.fiscalYear,
      closedAt: r.closedAt,
      selectedCount: r.selectedCount,
    })),
  };
}
