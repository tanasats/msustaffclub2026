import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requireClubPermission } from '../middlewares/auth.js';
import { CLUB_PERMISSIONS } from '../services/club-permissions.js';
import { getClubPage, listClubDirectory, listClubMembers } from '../services/club-service.js';
import { parseIdParam } from './validation.js';

export const clubsRouter = Router();

const listSchema = z.object({
  q: z.string().trim().max(100).optional().transform((value) => value || null),
  category: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50).optional().transform((value) => value ?? null),
  mine: z.enum(['1', 'true']).optional().transform((value) => Boolean(value)),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ต้อง login เท่านั้น: ทำเนียบชมรม (?mine=1 = ชมรมของฉัน)
clubsRouter.get('/clubs', requireAuth, async (req, res) => {
  const { q, category, mine, page, pageSize } = listSchema.parse(req.query);
  res.json(await listClubDirectory(getRequiredAuth(req), { query: q, categoryCode: category, mineOnly: mine, page, pageSize }));
});

// ต้อง login เท่านั้น: หน้าชมรม (ข้อมูลภายในแสดงตามสิทธิ์ชมรม)
clubsRouter.get('/clubs/:clubId', requireAuth, async (req, res) => {
  res.json(await getClubPage(getRequiredAuth(req), parseIdParam(req.params.clubId, 'CLUB_NOT_FOUND', 'ไม่พบชมรม')));
});

// ต้องมีสิทธิ์ชมรม club:view_internal: รายชื่อสมาชิก
clubsRouter.get('/clubs/:clubId/members', requireAuth, requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL), async (req, res) => {
  const { page, pageSize } = pageSchema.parse(req.query);
  res.json(await listClubMembers(req.params.clubId as string, page, pageSize));
});
