import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import { ACHIEVEMENT_LEVELS } from '../repositories/achievements-repository.js';
import {
  createStatDefinition,
  deleteCompetition,
  editCompetition,
  editStatDefinition,
  getAthleteSummary,
  getClubCompetitions,
  getCompetition,
  getStatDefinitions,
  recordCompetition,
} from '../services/competition-service.js';
import { fiscalYearOf } from '../services/fiscal-year.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

// การแข่งขันและสถิตินักกีฬา (ระยะที่ 5 ขั้น 5.2)
export const competitionsRouter = Router();

const idOf = (value: unknown, code: string, message: string) => parseIdParam(value, code, message);
const clubIdOf = (value: unknown) => idOf(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
const competitionIdOf = (value: unknown) => idOf(value, 'COMPETITION_NOT_FOUND', 'ไม่พบการแข่งขัน');

const better = z.enum(['higher', 'lower']);
const newStatSchema = z
  .object({ code: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50), nameTh: requiredText(100), unit: optionalText(30).optional(), better })
  .strict();
const editStatSchema = z.object({ nameTh: requiredText(100), unit: optionalText(30).optional(), better, isActive: z.boolean() }).strict();

const competitionSchema = z
  .object({
    sportId: z.uuid(),
    title: requiredText(300),
    eventName: optionalText(200).optional(),
    level: z.enum(ACHIEVEMENT_LEVELS),
    format: z.enum(['individual', 'team']),
    heldFrom: z.iso.date(),
    heldTo: z.iso.date().nullable().optional(),
    location: optionalText(300).optional(),
    organizer: optionalText(300).optional(),
    note: optionalText(2000).optional(),
    results: z
      .array(
        z
          .object({
            userId: z.uuid(),
            rank: z.number().int().min(1).max(10000).nullable().optional(),
            medal: z.enum(['gold', 'silver', 'bronze']).nullable().optional(),
            note: optionalText(500).optional(),
            stats: z.array(z.object({ statId: z.uuid(), value: z.number().finite().min(-1e9).max(1e9) }).strict()).max(30).default([]),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict()
  .refine((c) => !c.heldTo || c.heldTo >= c.heldFrom, { message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', path: ['heldTo'] })
  .transform((c) => ({
    ...c,
    eventName: c.eventName ?? null,
    heldTo: c.heldTo ?? null,
    location: c.location ?? null,
    organizer: c.organizer ?? null,
    note: c.note ?? null,
    results: c.results.map((r) => ({ ...r, rank: r.rank ?? null, medal: r.medal ?? null, note: r.note ?? null })),
  }));
const yearQuery = z.object({ fiscalYear: z.coerce.number().int().min(2500).max(2700).optional() });

// ---------- ค่าสถิติของชนิดกีฬา ----------

// ต้อง login เท่านั้น: ค่าสถิติของชนิดกีฬา
competitionsRouter.get('/sports/:id/stats', requireAuth, async (req, res) => {
  res.json(await getStatDefinitions(getRequiredAuth(req), idOf(req.params.id, 'SPORT_NOT_FOUND', 'ไม่พบชนิดกีฬา')));
});

// ต้องมี permission sport:manage (ตรวจใน service): เพิ่ม / แก้ไข ค่าสถิติ
competitionsRouter.post('/sports/:id/stats', requireAuth, async (req, res) => {
  const input = newStatSchema.parse(req.body);
  const id = await createStatDefinition(getRequiredAuth(req), idOf(req.params.id, 'SPORT_NOT_FOUND', 'ไม่พบชนิดกีฬา'), {
    ...input,
    unit: input.unit ?? null,
  });
  res.status(201).json({ id });
});

competitionsRouter.put('/sport-stats/:id', requireAuth, async (req, res) => {
  const input = editStatSchema.parse(req.body);
  await editStatDefinition(getRequiredAuth(req), idOf(req.params.id, 'STAT_NOT_FOUND', 'ไม่พบค่าสถิติ'), { ...input, unit: input.unit ?? null });
  res.status(204).end();
});

// ---------- การแข่งขัน ----------

// ต้อง login เท่านั้น: การแข่งขันของชมรมในปีงบประมาณ
competitionsRouter.get('/clubs/:clubId/competitions', requireAuth, async (req, res) => {
  const { fiscalYear } = yearQuery.parse(req.query);
  res.json(await getClubCompetitions(clubIdOf(req.params.clubId), fiscalYear ?? fiscalYearOf()));
});

// ต้องมีสิทธิ์ชมรม club_sport:manage (ตรวจใน service): บันทึกการแข่งขันพร้อมผล
competitionsRouter.post('/clubs/:clubId/competitions', requireAuth, async (req, res) => {
  const id = await recordCompetition(getRequiredAuth(req), clubIdOf(req.params.clubId), competitionSchema.parse(req.body));
  res.status(201).json({ id });
});

// ต้อง login เท่านั้น (ค่าสถิติตามสิทธิ์ ตรวจใน service): รายละเอียดการแข่งขัน
competitionsRouter.get('/competitions/:id', requireAuth, async (req, res) => {
  res.json(await getCompetition(getRequiredAuth(req), competitionIdOf(req.params.id)));
});

// ต้องมีสิทธิ์ชมรม club_sport:manage (ตรวจใน service): แก้ไข / ลบ
competitionsRouter.put('/competitions/:id', requireAuth, async (req, res) => {
  await editCompetition(getRequiredAuth(req), competitionIdOf(req.params.id), competitionSchema.parse(req.body));
  res.status(204).end();
});

competitionsRouter.delete('/competitions/:id', requireAuth, async (req, res) => {
  await deleteCompetition(getRequiredAuth(req), competitionIdOf(req.params.id));
  res.status(204).end();
});

// เจ้าตัว หรือ club:view_internal (ตรวจใน service): สรุปนักกีฬา
competitionsRouter.get('/clubs/:clubId/athletes/:userId/summary', requireAuth, async (req, res) => {
  res.json(await getAthleteSummary(getRequiredAuth(req), clubIdOf(req.params.clubId), idOf(req.params.userId, 'ATHLETE_NOT_FOUND', 'ไม่พบข้อมูลนักกีฬา')));
});
