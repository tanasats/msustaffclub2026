import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import { FONT_SCALES, getPreferences, updatePreferences } from '../services/preferences-service.js';

export const meRouter = Router();

const preferencesSchema = z.object({ fontScale: z.enum(FONT_SCALES) }).strict();

// ต้อง login เท่านั้น: ค่าตั้งค่าส่วนตัวของผู้ใช้ปัจจุบัน
meRouter.get('/me/preferences', requireAuth, async (req, res) => {
  res.json(await getPreferences(getRequiredAuth(req).user.id));
});

// ต้อง login เท่านั้น: แก้ได้เฉพาะค่าของตัวเอง
meRouter.patch('/me/preferences', requireAuth, async (req, res) => {
  const { fontScale } = preferencesSchema.parse(req.body);
  res.json(await updatePreferences(getRequiredAuth(req).user.id, { fontScale }));
});
