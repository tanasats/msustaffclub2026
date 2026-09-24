import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listActiveClubCategories, listClubPositions } from '../repositories/club-master-repository.js';

// ข้อมูลหลักของชมรม (ใช้ในฟอร์ม)
export const clubMasterRouter = Router();

// ต้อง login เท่านั้น
clubMasterRouter.get('/club-categories', requireAuth, async (_req, res) => {
  res.json({ items: await listActiveClubCategories() });
});

// ต้อง login เท่านั้น
clubMasterRouter.get('/club-positions', requireAuth, async (_req, res) => {
  res.json({ items: await listClubPositions() });
});
