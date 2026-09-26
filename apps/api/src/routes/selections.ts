import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import { close, createRound, decide, getAnnouncement, getAnnouncements, getRound, getRounds } from '../services/selection-service.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

// การคัดเลือกตัวแทน / รางวัลเชิดชูเกียรติ (ระยะที่ 5 ขั้น 5.3)
export const selectionsRouter = Router();

const roundIdOf = (value: unknown) => parseIdParam(value, 'ROUND_NOT_FOUND', 'ไม่พบรอบคัดเลือก');

const roundSchema = z
  .object({
    kind: z.enum(['representative', 'award']),
    title: requiredText(300),
    sportId: z.uuid().nullable().optional(),
    eventName: optionalText(200).optional(),
    fiscalYear: z.number().int().min(2500).max(2700),
    criteria: optionalText(5000).optional(),
    slots: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .strict()
  .transform((r) => ({
    ...r,
    sportId: r.sportId ?? null,
    eventName: r.eventName ?? null,
    criteria: r.criteria ?? null,
    slots: r.slots ?? null,
  }));
const decisionSchema = z
  .object({ userId: z.uuid(), decision: z.enum(['selected', 'reserve', 'not_selected']), reason: requiredText(2000) })
  .strict();

// ต้องมี permission sport_selection:manage (ตรวจใน service): รายการรอบ / เปิดรอบ / ตารางจัดอันดับ / ตัดสิน / ปิดรอบ
selectionsRouter.get('/selection-rounds', requireAuth, async (req, res) => {
  res.json(await getRounds(getRequiredAuth(req)));
});

selectionsRouter.post('/selection-rounds', requireAuth, async (req, res) => {
  res.status(201).json({ id: await createRound(getRequiredAuth(req), roundSchema.parse(req.body)) });
});

selectionsRouter.get('/selection-rounds/:id', requireAuth, async (req, res) => {
  res.json(await getRound(getRequiredAuth(req), roundIdOf(req.params.id)));
});

selectionsRouter.post('/selection-rounds/:id/decisions', requireAuth, async (req, res) => {
  const { userId, decision, reason } = decisionSchema.parse(req.body);
  await decide(getRequiredAuth(req), roundIdOf(req.params.id), userId, decision, reason);
  res.status(204).end();
});

selectionsRouter.post('/selection-rounds/:id/close', requireAuth, async (req, res) => {
  await close(getRequiredAuth(req), roundIdOf(req.params.id));
  res.status(204).end();
});

// ต้อง login เท่านั้น: ประกาศผล (รอบที่ปิดแล้ว)
selectionsRouter.get('/selection-rounds/:id/announcement', requireAuth, async (req, res) => {
  res.json(await getAnnouncement(roundIdOf(req.params.id)));
});

// ต้อง login เท่านั้น: รายการประกาศผล
selectionsRouter.get('/selection-announcements', requireAuth, async (_req, res) => {
  res.json(await getAnnouncements());
});
