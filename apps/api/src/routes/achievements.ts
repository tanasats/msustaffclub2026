import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requireClubPermission } from '../middlewares/auth.js';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_LEVELS } from '../repositories/achievements-repository.js';
import {
  getAchievement,
  listAchievementReviewQueue,
  listClubAchievements,
  listMyAchievements,
  MAX_ACHIEVEMENT_FILES,
  reviewAchievement,
  submitAchievement,
  updateAchievement,
  withdrawAchievement,
} from '../services/achievement-service.js';
import { CLUB_PERMISSIONS } from '../services/club-permissions.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

// ผลงานชมรม (ทุกประเภทชมรม): เจ้าของบันทึก → กรรมการชมรมรับรอง
export const achievementsRouter = Router();

const idOf = (value: unknown) => parseIdParam(value, 'ACHIEVEMENT_NOT_FOUND', 'ไม่พบผลงาน');
const clubIdOf = (value: unknown) => parseIdParam(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');

const achievementSchema = z
  .object({
    title: requiredText(300),
    achievedOn: z.iso.date(),
    level: z.enum(ACHIEVEMENT_LEVELS),
    category: z.enum(ACHIEVEMENT_CATEGORIES),
    award: optionalText(200).optional(),
    organizer: optionalText(300).optional(),
    description: optionalText(5000).optional(),
    fileIds: z.array(z.uuid()).max(MAX_ACHIEVEMENT_FILES).default([]),
  })
  .strict()
  .transform((input) => ({
    ...input,
    award: input.award ?? null,
    organizer: input.organizer ?? null,
    description: input.description ?? null,
  }));
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const noteSchema = z.object({ note: optionalText(1000).optional() }).strict();
const reviewSchema = z.object({ decision: z.enum(['approve', 'return', 'reject']), note: optionalText(1000).optional() }).strict();

// ต้อง login เท่านั้น (ต้องเป็นสมาชิกชมรม ตรวจใน service): บันทึกผลงานของตัวเอง
achievementsRouter.post('/clubs/:clubId/achievements', requireAuth, async (req, res) => {
  const id = await submitAchievement(getRequiredAuth(req), clubIdOf(req.params.clubId), achievementSchema.parse(req.body));
  res.status(201).json({ id });
});

// ต้อง login เท่านั้น: ผลงานที่รับรองแล้วของชมรม
achievementsRouter.get('/clubs/:clubId/achievements', requireAuth, async (req, res) => {
  const { page, pageSize } = pageSchema.parse(req.query);
  res.json(await listClubAchievements(clubIdOf(req.params.clubId), page, pageSize));
});

// ต้องมีสิทธิ์ชมรม club_achievement:manage: คิวรอรับรอง
achievementsRouter.get(
  '/clubs/:clubId/achievement-reviews',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.ACHIEVEMENT_MANAGE),
  async (req, res) => {
    res.json(await listAchievementReviewQueue(req.params.clubId as string));
  },
);

// ต้อง login เท่านั้น: ผลงานของฉัน (ทุกสถานะ)
achievementsRouter.get('/me/achievements', requireAuth, async (req, res) => {
  const { page, pageSize } = pageSchema.parse(req.query);
  res.json(await listMyAchievements(getRequiredAuth(req), page, pageSize));
});

// ต้อง login เท่านั้น (ข้อมูลที่เห็นตามสิทธิ์ ตรวจใน service): รายละเอียดผลงาน
achievementsRouter.get('/achievements/:id', requireAuth, async (req, res) => {
  res.json(await getAchievement(getRequiredAuth(req), idOf(req.params.id)));
});

// ต้อง login เท่านั้น (ต้องเป็นเจ้าของ ตรวจใน service): แก้ไข / แก้แล้วส่งใหม่
achievementsRouter.put('/achievements/:id', requireAuth, async (req, res) => {
  await updateAchievement(getRequiredAuth(req), idOf(req.params.id), achievementSchema.parse(req.body));
  res.status(204).end();
});

// ต้อง login เท่านั้น (ต้องเป็นเจ้าของ ตรวจใน service): ถอนผลงาน
achievementsRouter.post('/achievements/:id/withdraw', requireAuth, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await withdrawAchievement(getRequiredAuth(req), idOf(req.params.id), note ?? null);
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_achievement:manage ของชมรมเจ้าของผลงาน (ตรวจใน service): รับรอง / ส่งกลับ / ไม่รับรอง
achievementsRouter.post('/achievements/:id/review', requireAuth, async (req, res) => {
  const { decision, note } = reviewSchema.parse(req.body);
  await reviewAchievement(getRequiredAuth(req), idOf(req.params.id), decision, note ?? null);
  res.status(204).end();
});
