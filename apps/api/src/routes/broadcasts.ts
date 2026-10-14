import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requireClubPermission, requirePermission } from '../middlewares/auth.js';
import {
  countClubMessageRecipients,
  countStaffAnnouncementRecipients,
  getAnnouncementOrgUnits,
  listClubMessages,
  listStaffAnnouncements,
  sendClubMessage,
  sendStaffAnnouncement,
} from '../services/broadcast-service.js';
import { CLUB_PERMISSIONS } from '../services/club-permissions.js';
import { PERMISSIONS } from '../services/permissions.js';
import { requiredText } from './validation.js';

export const broadcastsRouter = Router();

const audienceSchema = z
  .object({
    audience: z.enum(['all_staff', 'club_committees', 'club_members', 'org_units']),
    orgUnitIds: z.array(z.uuid()).max(100).default([]),
  })
  .strict();
const messageFields = { title: requiredText(200), body: requiredText(3000) };
const staffAnnouncementSchema = audienceSchema.extend(messageFields).strict();
const clubMessageSchema = z.object(messageFields).strict();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });

// ---------- ประกาศจากสโมสรบุคลากร: ต้องมี staff_announcement:send (เจ้าหน้าที่สโมสร / นายกสโมสร) ----------
const requireAnnouncer = requirePermission(PERMISSIONS.STAFF_ANNOUNCEMENT_SEND);

broadcastsRouter.get('/staff-announcements', requireAnnouncer, async (req, res) => {
  res.json(await listStaffAnnouncements(pageSchema.parse(req.query).page));
});

broadcastsRouter.get('/staff-announcements/org-units', requireAnnouncer, async (_req, res) => {
  res.json(await getAnnouncementOrgUnits());
});

// จำนวนผู้รับก่อนส่ง (POST เพราะรับรายการหน่วยงาน)
broadcastsRouter.post('/staff-announcements/recipient-count', requireAnnouncer, async (req, res) => {
  res.json(await countStaffAnnouncementRecipients(getRequiredAuth(req), audienceSchema.parse(req.body)));
});

broadcastsRouter.post('/staff-announcements', requireAnnouncer, async (req, res) => {
  res.status(201).json(await sendStaffAnnouncement(getRequiredAuth(req), staffAnnouncementSchema.parse(req.body)));
});

// ---------- ข้อความชมรมถึงสมาชิก: ต้องมีสิทธิ์ชมรม club_message:send (กรรมการทุกตำแหน่ง) ----------
const requireClubSender = [requireAuth, requireClubPermission(CLUB_PERMISSIONS.MESSAGE_SEND)];

broadcastsRouter.get('/clubs/:clubId/messages', ...requireClubSender, async (req, res) => {
  res.json(await listClubMessages(String(req.params.clubId), pageSchema.parse(req.query).page));
});

broadcastsRouter.get('/clubs/:clubId/messages/recipient-count', ...requireClubSender, async (req, res) => {
  res.json(await countClubMessageRecipients(getRequiredAuth(req), String(req.params.clubId)));
});

broadcastsRouter.post('/clubs/:clubId/messages', ...requireClubSender, async (req, res) => {
  res.status(201).json(await sendClubMessage(getRequiredAuth(req), String(req.params.clubId), clubMessageSchema.parse(req.body)));
});
