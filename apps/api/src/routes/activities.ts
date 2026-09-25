import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth } from '../middlewares/auth.js';
import {
  addPlannedActivity,
  deleteActivity,
  editActivity,
  editPlannedActivity,
  getActivities,
  getActivity,
  getActivityPlan,
  MAX_ACTIVITY_PHOTOS,
  recordActivity,
  removePlannedActivity,
} from '../services/activity-service.js';
import { fiscalYearOf } from '../services/fiscal-year.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

// แผนกิจกรรมและกิจกรรมที่จัดจริงของชมรม (ระเบียบข้อ 14, 16)
export const activitiesRouter = Router();

const clubIdOf = (value: unknown) => parseIdParam(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
const planIdOf = (value: unknown) => parseIdParam(value, 'PLAN_NOT_FOUND', 'ไม่พบรายการในแผน');
const activityIdOf = (value: unknown) => parseIdParam(value, 'ACTIVITY_NOT_FOUND', 'ไม่พบกิจกรรม');

const yearQuery = z.object({
  fiscalYear: z.coerce.number().int().min(2500).max(2700).optional(),
});
const planSchema = z
  .object({
    plannedDate: z.iso.date().nullable().optional(),
    plannedTime: optionalText(100).optional(),
    title: requiredText(300),
    note: optionalText(2000).optional(),
  })
  .strict()
  .transform((input) => ({
    plannedDate: input.plannedDate ?? null,
    plannedTime: input.plannedTime ?? null,
    title: input.title,
    note: input.note ?? null,
  }));
const newPlanSchema = z.object({ fiscalYear: z.number().int().min(2500).max(2700) }).passthrough();
const activitySchema = z
  .object({
    plannedActivityId: z.uuid().nullable().optional(),
    heldOn: z.iso.date(),
    timeText: optionalText(100).optional(),
    title: requiredText(300),
    location: optionalText(300).optional(),
    summary: optionalText(5000).optional(),
    participantCount: z.number().int().min(0).max(100000).nullable().optional(),
    participantUserIds: z.array(z.uuid()).max(1000).default([]),
    photoFileIds: z.array(z.uuid()).max(MAX_ACTIVITY_PHOTOS).default([]),
  })
  .strict()
  .transform((input) => ({
    ...input,
    plannedActivityId: input.plannedActivityId ?? null,
    timeText: input.timeText ?? null,
    location: input.location ?? null,
    summary: input.summary ?? null,
    participantCount: input.participantCount ?? null,
  }));

// ---------- แผนกิจกรรม ----------

// ต้อง login เท่านั้น: แผนกิจกรรมในปีงบประมาณ (ไม่ระบุ = ปีปัจจุบัน)
activitiesRouter.get('/clubs/:clubId/activity-plans', requireAuth, async (req, res) => {
  const { fiscalYear } = yearQuery.parse(req.query);
  res.json(await getActivityPlan(clubIdOf(req.params.clubId), fiscalYear ?? fiscalYearOf()));
});

// ต้องมีสิทธิ์ชมรม club_activity:manage (ตรวจใน service): เพิ่ม / แก้ / ลบ รายการในแผน
activitiesRouter.post('/clubs/:clubId/activity-plans', requireAuth, async (req, res) => {
  const { fiscalYear, ...rest } = newPlanSchema.parse(req.body);
  const id = await addPlannedActivity(getRequiredAuth(req), clubIdOf(req.params.clubId), fiscalYear, planSchema.parse(rest));
  res.status(201).json({ id });
});

activitiesRouter.put('/clubs/:clubId/activity-plans/:planId', requireAuth, async (req, res) => {
  await editPlannedActivity(getRequiredAuth(req), clubIdOf(req.params.clubId), planIdOf(req.params.planId), planSchema.parse(req.body));
  res.status(204).end();
});

activitiesRouter.delete('/clubs/:clubId/activity-plans/:planId', requireAuth, async (req, res) => {
  await removePlannedActivity(getRequiredAuth(req), clubIdOf(req.params.clubId), planIdOf(req.params.planId));
  res.status(204).end();
});

// ---------- กิจกรรมที่จัดจริง ----------

// ต้อง login เท่านั้น: กิจกรรมของชมรมในปีงบประมาณ
activitiesRouter.get('/clubs/:clubId/activities', requireAuth, async (req, res) => {
  const { fiscalYear } = yearQuery.parse(req.query);
  res.json(await getActivities(clubIdOf(req.params.clubId), fiscalYear ?? fiscalYearOf()));
});

// ต้องมีสิทธิ์ชมรม club_activity:manage (ตรวจใน service): บันทึกกิจกรรม
activitiesRouter.post('/clubs/:clubId/activities', requireAuth, async (req, res) => {
  const id = await recordActivity(getRequiredAuth(req), clubIdOf(req.params.clubId), activitySchema.parse(req.body));
  res.status(201).json({ id });
});

// ต้อง login เท่านั้น (ข้อมูลภายในตามสิทธิ์ ตรวจใน service): รายละเอียดกิจกรรม
activitiesRouter.get('/activities/:id', requireAuth, async (req, res) => {
  res.json(await getActivity(getRequiredAuth(req), activityIdOf(req.params.id)));
});

// ต้องมีสิทธิ์ชมรม club_activity:manage ของชมรมเจ้าของกิจกรรม (ตรวจใน service): แก้ไข / ลบ
activitiesRouter.put('/activities/:id', requireAuth, async (req, res) => {
  await editActivity(getRequiredAuth(req), activityIdOf(req.params.id), activitySchema.parse(req.body));
  res.status(204).end();
});

activitiesRouter.delete('/activities/:id', requireAuth, async (req, res) => {
  await deleteActivity(getRequiredAuth(req), activityIdOf(req.params.id));
  res.status(204).end();
});
