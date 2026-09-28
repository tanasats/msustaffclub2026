import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import { getMyAdvisorWork } from '../services/advisor-work-service.js';
import { acknowledgePrivacyNotice } from '../services/privacy-service.js';
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

// ต้อง login เท่านั้น: กล่องงานที่ปรึกษาชมรมของตัวเอง (ไม่เป็นที่ปรึกษา = รายการว่าง)
meRouter.get('/me/advisor-work', requireAuth, async (req, res) => {
  res.json(await getMyAdvisorWork(getRequiredAuth(req)));
});

const acknowledgeSchema = z.object({ version: z.string().trim().min(1).max(20) }).strict();

// ต้อง login เท่านั้น: รับทราบประกาศความเป็นส่วนตัวของระบบ (บันทึกเป็นหลักฐาน ห้ามแก้/ลบ)
meRouter.post('/me/privacy/acknowledge', requireAuth, async (req, res) => {
  const { version } = acknowledgeSchema.parse(req.body);
  await acknowledgePrivacyNotice(getRequiredAuth(req), version);
  res.status(204).end();
});
