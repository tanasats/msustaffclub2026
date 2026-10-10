import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import { getMyAdvisorWork } from '../services/advisor-work-service.js';
import { getMyData } from '../services/my-data-service.js';
import { acknowledgePrivacyNotice } from '../services/privacy-service.js';
import { FONT_SCALES, getPreferences, updatePreferences } from '../services/preferences-service.js';
import { listMyNotifications, markAllMyNotificationsRead, markMyNotificationRead } from '../services/notifications-service.js';

export const meRouter = Router();

// แก้ทีละค่าได้ ต้องส่งอย่างน้อย 1 ค่า
const preferencesSchema = z
  .object({ fontScale: z.enum(FONT_SCALES).optional(), emailNotifications: z.boolean().optional() })
  .strict()
  .refine((value) => value.fontScale !== undefined || value.emailNotifications !== undefined, { message: 'ต้องระบุค่าที่จะแก้อย่างน้อย 1 ค่า' });

// ต้อง login เท่านั้น: ค่าตั้งค่าส่วนตัวของผู้ใช้ปัจจุบัน
meRouter.get('/me/preferences', requireAuth, async (req, res) => {
  res.json(await getPreferences(getRequiredAuth(req).user.id));
});

// ต้อง login เท่านั้น: แก้ได้เฉพาะค่าของตัวเอง
meRouter.patch('/me/preferences', requireAuth, async (req, res) => {
  res.json(await updatePreferences(getRequiredAuth(req).user.id, preferencesSchema.parse(req.body)));
});

const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// ต้อง login เท่านั้น: การแจ้งเตือนในระบบของตัวเอง (ใหม่สุดก่อน) พร้อมจำนวนที่ยังไม่อ่าน
meRouter.get('/me/notifications', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await listMyNotifications(getRequiredAuth(req), notificationsQuerySchema.parse(req.query)));
});

// ต้อง login เท่านั้น: อ่านทั้งหมด
meRouter.post('/me/notifications/read-all', requireAuth, async (req, res) => {
  await markAllMyNotificationsRead(getRequiredAuth(req));
  res.status(204).end();
});

// ต้อง login เท่านั้น: ทำเครื่องหมายอ่านแล้ว (เฉพาะของตัวเอง — ของคนอื่นตอบ 404)
meRouter.post('/me/notifications/:id/read', requireAuth, async (req, res) => {
  await markMyNotificationRead(getRequiredAuth(req), z.uuid().parse(req.params.id));
  res.status(204).end();
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

// ต้อง login เท่านั้น: ข้อมูลส่วนบุคคลทั้งหมดของตัวเอง (หน้า "ข้อมูลของฉัน" และไฟล์ดาวน์โหลด) — ห้าม cache
meRouter.get('/me/data', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getMyData(getRequiredAuth(req)));
});
