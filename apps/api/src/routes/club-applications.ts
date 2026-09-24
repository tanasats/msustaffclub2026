import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requirePermission } from '../middlewares/auth.js';
import {
  cancelApplication,
  createEstablishDraft,
  getApplicationDetail,
  listMyApplications,
  replaceActivities,
  replaceAdvisors,
  replaceCommittee,
  replaceMembers,
  updateGeneral,
  validateForSubmission,
} from '../services/club-application-service.js';
import {
  decideApplication,
  listMyAdvisorRequests,
  listOfficerQueue,
  requestAdvisorConsent,
  respondAsAdvisor,
  reviewApplication,
  submitApplication,
  withdrawToDraft,
} from '../services/club-application-workflow-service.js';
import { MAX_OBJECTIVES } from '../services/club-rules.js';
import { PERMISSIONS } from '../services/permissions.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

export const clubApplicationsRouter = Router();

const requireCreate = requirePermission(PERMISSIONS.CLUB_APPLICATION_CREATE);
const idOf = (value: unknown) => parseIdParam(value, 'APPLICATION_NOT_FOUND', 'ไม่พบคำขอ');

const createSchema = z.object({
  nameTh: requiredText(200),
  fiscalYear: z.number().int().optional(),
});

const generalSchema = z
  .object({
    nameTh: requiredText(200),
    categoryId: z.uuid().nullable(),
    categoryDetail: optionalText(500),
    history: optionalText(20000),
    motto: optionalText(500),
    logoMeaning: optionalText(5000),
    objectives: z.array(requiredText(1000)).max(MAX_OBJECTIVES),
    officeLocation: optionalText(500),
    contactPhone: optionalText(50),
    contactEmail: z.email().max(200).nullable(),
    regulationText: optionalText(100000),
  })
  .partial()
  .strict();

const advisorsSchema = z.object({
  advisors: z.array(z.union([z.object({ userId: z.uuid() }).strict(), z.object({ email: z.email().max(200) }).strict()])),
});

const committeeSchema = z.object({
  committee: z
    .array(
      z.object({
        userId: z.uuid(),
        positionCode: z.string().min(1).max(50),
        positionTitle: optionalText(200).optional(),
        workLocation: optionalText(500).optional(),
        contactPhone: optionalText(50).optional(),
        bio: optionalText(5000).optional(),
      }),
    )
    .min(1)
    .max(100),
});

const membersSchema = z.object({
  memberUserIds: z.array(z.uuid()).max(1000),
});

const activitiesSchema = z.object({
  activities: z
    .array(
      z.object({
        activityDate: z.iso.date().nullable().optional(),
        activityTime: optionalText(100).optional(),
        title: requiredText(500),
        note: optionalText(1000).optional(),
      }),
    )
    .max(200),
});

const cancelSchema = z.object({ note: optionalText(1000).optional() });
const noteSchema = z.object({ note: optionalText(2000).optional() }).strict();
const advisorResponseSchema = z.object({ decision: z.enum(['accept', 'decline']), note: optionalText(2000).optional() });
const reviewSchema = z.object({ decision: z.enum(['pass', 'return']), note: optionalText(2000).optional() });
const decisionSchema = z.object({ decision: z.enum(['approve', 'reject', 'return']), note: optionalText(2000).optional() });
const statusValues = ['draft', 'awaiting_consent', 'submitted', 'returned', 'reviewed', 'approved', 'rejected', 'cancelled'] as const;
const queueQuerySchema = z.object({
  // ?status=submitted,reviewed
  status: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',') : []))
    .pipe(z.array(z.enum(statusValues))),
});

// ต้องมี club_application:create: สร้างคำขอจัดตั้งชมรม (ฉบับร่าง)
clubApplicationsRouter.post('/club-applications', requireCreate, async (req, res) => {
  const input = createSchema.parse(req.body);
  const id = await createEstablishDraft(getRequiredAuth(req), input);
  res.status(201).json({ id });
});

// ต้อง login เท่านั้น: คำขอที่ฉันเป็นผู้ยื่น
clubApplicationsRouter.get('/club-applications/mine', requireAuth, async (req, res) => {
  res.json({ items: await listMyApplications(getRequiredAuth(req)) });
});

// ต้อง login เท่านั้น: คำขอที่ฉันถูกเสนอเป็นที่ปรึกษา (ประกาศก่อน /:id)
clubApplicationsRouter.get('/club-applications/advisor-requests', requireAuth, async (req, res) => {
  res.json({ items: await listMyAdvisorRequests(getRequiredAuth(req)) });
});

// ต้องมี review / approve / read_all / manage_all อย่างใดอย่างหนึ่ง (ตรวจใน service): กล่องงานเจ้าหน้าที่
clubApplicationsRouter.get('/club-applications/queue', requireAuth, async (req, res) => {
  const { status } = queueQuerySchema.parse(req.query);
  res.json({ items: await listOfficerQueue(getRequiredAuth(req), status) });
});

// ต้อง login + เป็นผู้ยื่น/ที่ปรึกษาที่ถูกเสนอ/ผู้มีสิทธิ์ตรวจ (ตรวจใน service)
clubApplicationsRouter.get('/club-applications/:id', requireAuth, async (req, res) => {
  res.json(await getApplicationDetail(getRequiredAuth(req), idOf(req.params.id)));
});

// ต้อง login + สิทธิ์ดูคำขอ: สิ่งที่ยังขาดก่อนยื่น
clubApplicationsRouter.get('/club-applications/:id/validation', requireAuth, async (req, res) => {
  res.json({ issues: await validateForSubmission(getRequiredAuth(req), idOf(req.params.id)) });
});

// ส่วนแก้ไขด้านล่าง: ต้องมี club_application:create + เป็นผู้ยื่น + คำขออยู่ในสถานะแก้ได้ (ตรวจใน service)
clubApplicationsRouter.patch('/club-applications/:id', requireCreate, async (req, res) => {
  await updateGeneral(getRequiredAuth(req), idOf(req.params.id), generalSchema.parse(req.body));
  res.status(204).end();
});

clubApplicationsRouter.put('/club-applications/:id/advisors', requireCreate, async (req, res) => {
  const { advisors } = advisorsSchema.parse(req.body);
  await replaceAdvisors(getRequiredAuth(req), idOf(req.params.id), advisors);
  res.status(204).end();
});

clubApplicationsRouter.put('/club-applications/:id/committee', requireCreate, async (req, res) => {
  const { committee } = committeeSchema.parse(req.body);
  await replaceCommittee(getRequiredAuth(req), idOf(req.params.id), committee);
  res.status(204).end();
});

clubApplicationsRouter.put('/club-applications/:id/members', requireCreate, async (req, res) => {
  const { memberUserIds } = membersSchema.parse(req.body);
  await replaceMembers(getRequiredAuth(req), idOf(req.params.id), memberUserIds);
  res.status(204).end();
});

clubApplicationsRouter.put('/club-applications/:id/activities', requireCreate, async (req, res) => {
  const { activities } = activitiesSchema.parse(req.body);
  await replaceActivities(getRequiredAuth(req), idOf(req.params.id), activities);
  res.status(204).end();
});

clubApplicationsRouter.post('/club-applications/:id/cancel', requireCreate, async (req, res) => {
  const { note } = cancelSchema.parse(req.body ?? {});
  await cancelApplication(getRequiredAuth(req), idOf(req.params.id), note ?? null);
  res.status(204).end();
});

// ---------- ขั้นตอนอนุมัติ ----------

// ผู้ยื่น (ต้องมี club_application:create + เป็นผู้ยื่น): ส่งให้ที่ปรึกษายินยอม / ดึงกลับไปแก้ / ยื่นต่อสโมสร
clubApplicationsRouter.post('/club-applications/:id/request-consent', requireCreate, async (req, res) => {
  await requestAdvisorConsent(getRequiredAuth(req), idOf(req.params.id));
  res.status(204).end();
});

clubApplicationsRouter.post('/club-applications/:id/withdraw', requireCreate, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await withdrawToDraft(getRequiredAuth(req), idOf(req.params.id), note ?? null);
  res.status(204).end();
});

clubApplicationsRouter.post('/club-applications/:id/submit', requireCreate, async (req, res) => {
  await submitApplication(getRequiredAuth(req), idOf(req.params.id));
  res.status(204).end();
});

// ต้อง login + เป็นที่ปรึกษาที่ถูกเสนอ (ตรวจใน service)
clubApplicationsRouter.post('/club-applications/:id/advisor-response', requireAuth, async (req, res) => {
  const { decision, note } = advisorResponseSchema.parse(req.body);
  await respondAsAdvisor(getRequiredAuth(req), idOf(req.params.id), decision, note ?? null);
  res.status(204).end();
});

// ต้องมี club_application:review (ตรวจใน service พร้อมห้ามตรวจคำขอของตัวเอง): ตรวจขั้นที่ 1
clubApplicationsRouter.post('/club-applications/:id/review', requireAuth, async (req, res) => {
  const { decision, note } = reviewSchema.parse(req.body);
  await reviewApplication(getRequiredAuth(req), idOf(req.params.id), decision, note ?? null);
  res.status(204).end();
});

// ต้องมี club_application:approve (ตรวจใน service พร้อมห้ามอนุมัติคำขอของตัวเอง): อนุมัติขั้นที่ 2
clubApplicationsRouter.post('/club-applications/:id/decision', requireAuth, async (req, res) => {
  const { decision, note } = decisionSchema.parse(req.body);
  res.json(await decideApplication(getRequiredAuth(req), idOf(req.params.id), decision, note ?? null));
});
