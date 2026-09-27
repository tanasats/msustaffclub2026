import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requirePermission } from '../middlewares/auth.js';
import { getEmailAdmin, sendTestEmail, updateEmailSettings } from '../services/email-admin-service.js';
import { ALL_NOTIFICATION_EVENTS, type NotificationEvent } from '../services/notification-events.js';
import { PERMISSIONS } from '../services/permissions.js';

// ตั้งค่าระบบ: ทุก endpoint ต้องมี system_setting:manage (ไม่ผูก role ใด → เฉพาะ super_admin)
export const adminSettingsRouter = Router();
adminSettingsRouter.use('/admin/email-settings', requirePermission(PERMISSIONS.SYSTEM_SETTING_MANAGE));

const eventsSchema = z
  .object(Object.fromEntries(ALL_NOTIFICATION_EVENTS.map((code) => [code, z.boolean()])) as Record<NotificationEvent, z.ZodBoolean>)
  .strict();
const settingsSchema = z.object({ enabled: z.boolean(), events: eventsSchema }).strict();

adminSettingsRouter.get('/admin/email-settings', async (_req, res) => {
  res.json(await getEmailAdmin());
});

adminSettingsRouter.put('/admin/email-settings', async (req, res) => {
  await updateEmailSettings(getRequiredAuth(req), settingsSchema.parse(req.body));
  res.status(204).end();
});

adminSettingsRouter.post('/admin/email-settings/test', async (req, res) => {
  res.json(await sendTestEmail(getRequiredAuth(req)));
});
