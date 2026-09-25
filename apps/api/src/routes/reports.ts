import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requireClubPermission } from '../middlewares/auth.js';
import { CLUB_PERMISSIONS } from '../services/club-permissions.js';
import { fiscalYearOf } from '../services/fiscal-year.js';
import {
  acknowledgeReport,
  createMonthlyReport,
  getMonthlyReport,
  getMonthlyReports,
  saveMonthlyReport,
  submitReport,
} from '../services/report-service.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

// รายงานรายเดือนถึงที่ปรึกษา (ระเบียบข้อ 16)
export const reportsRouter = Router();

const reportIdOf = (value: unknown) => parseIdParam(value, 'REPORT_NOT_FOUND', 'ไม่พบรายงาน');
const clubIdOf = (value: unknown) => parseIdParam(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');

const yearQuery = z.object({ fiscalYear: z.coerce.number().int().min(2500).max(2700).optional() });
const createSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();
const saveSchema = z
  .object({
    summary: optionalText(5000).optional(),
    meetings: z
      .array(
        z
          .object({
            metOn: z.iso.date(),
            agenda: requiredText(2000),
            resolution: optionalText(5000).optional(),
            attendeeCount: z.number().int().min(0).max(100000).nullable().optional(),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict();
const noteSchema = z.object({ note: optionalText(1000).optional() }).strict();

// ต้องมีสิทธิ์ชมรม club:view_internal: รายงานรายเดือนของชมรมในปีงบประมาณ
reportsRouter.get('/clubs/:clubId/monthly-reports', requireAuth, requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL), async (req, res) => {
  const { fiscalYear } = yearQuery.parse(req.query);
  res.json(await getMonthlyReports(req.params.clubId as string, fiscalYear ?? fiscalYearOf()));
});

// ต้องมีสิทธิ์ชมรม club_report:submit (ตรวจใน service): สร้างร่างรายงานของเดือน
reportsRouter.post('/clubs/:clubId/monthly-reports', requireAuth, async (req, res) => {
  const { month } = createSchema.parse(req.body);
  res.status(201).json({ id: await createMonthlyReport(getRequiredAuth(req), clubIdOf(req.params.clubId), month) });
});

// ต้องมีสิทธิ์ชมรม club:view_internal ของชมรมเจ้าของรายงาน (ตรวจใน service): รายละเอียด
reportsRouter.get('/monthly-reports/:id', requireAuth, async (req, res) => {
  res.json(await getMonthlyReport(getRequiredAuth(req), reportIdOf(req.params.id)));
});

// ต้องมีสิทธิ์ชมรม club_report:submit (ตรวจใน service): บันทึกร่าง / ส่ง
reportsRouter.put('/monthly-reports/:id', requireAuth, async (req, res) => {
  const input = saveSchema.parse(req.body);
  await saveMonthlyReport(getRequiredAuth(req), reportIdOf(req.params.id), {
    summary: input.summary ?? null,
    meetings: input.meetings.map((m) => ({ ...m, resolution: m.resolution ?? null, attendeeCount: m.attendeeCount ?? null })),
  });
  res.status(204).end();
});

reportsRouter.post('/monthly-reports/:id/submit', requireAuth, async (req, res) => {
  await submitReport(getRequiredAuth(req), reportIdOf(req.params.id));
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_report:acknowledge (ที่ปรึกษา ตรวจใน service): รับทราบรายงาน
reportsRouter.post('/monthly-reports/:id/acknowledge', requireAuth, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await acknowledgeReport(getRequiredAuth(req), reportIdOf(req.params.id), note ?? null);
  res.status(204).end();
});
