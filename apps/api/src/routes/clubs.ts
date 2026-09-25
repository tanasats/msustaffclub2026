import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requireClubPermission } from '../middlewares/auth.js';
import { CLUB_PERMISSIONS } from '../services/club-permissions.js';
import { getClubPage, listClubDirectory, listClubMembers } from '../services/club-service.js';
import {
  appointCommitteeMember,
  COMMITTEE_END_REASONS,
  endCommitteeTerm,
  getCommitteeHistory,
  resignFromCommittee,
  transferPresidency,
} from '../services/committee-service.js';
import {
  applyForMembership,
  approveMembership,
  leaveClub,
  listMembershipRequests,
  rejectMembership,
  removeMember,
  REMOVAL_REASONS,
  withdrawApplication,
} from '../services/membership-service.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

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

// ---------- สมาชิกภาพ ----------

const clubIdOf = (value: unknown) => parseIdParam(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
const membershipIdOf = (value: unknown) => parseIdParam(value, 'MEMBERSHIP_NOT_FOUND', 'ไม่พบใบสมัครหรือสมาชิกภาพ');
const noteSchema = z.object({ note: optionalText(1000).optional() }).strict();
const removeSchema = z.object({ reason: z.enum(REMOVAL_REASONS), note: requiredText(1000) }).strict();

// ต้อง login เท่านั้น (ตรวจว่าเป็นบุคลากรใน service): สมัครเป็นสมาชิก
clubsRouter.post('/clubs/:clubId/membership', requireAuth, async (req, res) => {
  await applyForMembership(getRequiredAuth(req), clubIdOf(req.params.clubId));
  res.status(204).end();
});

// ต้อง login เท่านั้น: ยกเลิกใบสมัครของตัวเอง
clubsRouter.post('/clubs/:clubId/membership/withdraw', requireAuth, async (req, res) => {
  await withdrawApplication(getRequiredAuth(req), clubIdOf(req.params.clubId));
  res.status(204).end();
});

// ต้อง login เท่านั้น: ลาออกจากชมรม (มีผลทันที)
clubsRouter.post('/clubs/:clubId/membership/leave', requireAuth, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await leaveClub(getRequiredAuth(req), clubIdOf(req.params.clubId), note ?? null);
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_member:approve: ใบสมัครที่รออนุมัติ
clubsRouter.get(
  '/clubs/:clubId/membership-requests',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.MEMBER_APPROVE),
  async (req, res) => {
    res.json(await listMembershipRequests(req.params.clubId as string));
  },
);

// ต้องมีสิทธิ์ชมรม club_member:approve (ตรวจใน service): อนุมัติ / ปฏิเสธ / ให้พ้นสภาพ
clubsRouter.post('/clubs/:clubId/memberships/:membershipId/approve', requireAuth, async (req, res) => {
  await approveMembership(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId));
  res.status(204).end();
});

clubsRouter.post('/clubs/:clubId/memberships/:membershipId/reject', requireAuth, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await rejectMembership(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), note ?? null);
  res.status(204).end();
});

clubsRouter.post('/clubs/:clubId/memberships/:membershipId/remove', requireAuth, async (req, res) => {
  const { reason, note } = removeSchema.parse(req.body);
  await removeMember(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), reason, note);
  res.status(204).end();
});

// ---------- คณะกรรมการ ----------

const committeeMemberIdOf = (value: unknown) => parseIdParam(value, 'COMMITTEE_MEMBER_NOT_FOUND', 'ไม่พบกรรมการที่ดำรงตำแหน่งอยู่');
const appointSchema = z
  .object({
    userId: z.uuid(),
    positionCode: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50),
    positionTitle: optionalText(100).optional(),
    workLocation: optionalText(200).optional(),
    contactPhone: optionalText(50).optional(),
    note: optionalText(1000).optional(),
  })
  .strict();
const transferSchema = z
  .object({
    userId: z.uuid(),
    workLocation: optionalText(200).optional(),
    contactPhone: optionalText(50).optional(),
    note: optionalText(1000).optional(),
  })
  .strict();
const endTermSchema = z.object({ reason: z.enum(COMMITTEE_END_REASONS), note: requiredText(1000) }).strict();

// ต้องมีสิทธิ์ชมรม club:view_internal: ประวัติกรรมการที่พ้นตำแหน่งแล้ว
clubsRouter.get(
  '/clubs/:clubId/committee/history',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL),
  async (req, res) => {
    res.json(await getCommitteeHistory(req.params.clubId as string));
  },
);

// ต้องมีสิทธิ์ชมรม club_committee:manage (ตรวจใน service): แต่งตั้งกรรมการ
clubsRouter.post('/clubs/:clubId/committee', requireAuth, async (req, res) => {
  const input = appointSchema.parse(req.body);
  const id = await appointCommitteeMember(getRequiredAuth(req), clubIdOf(req.params.clubId), {
    userId: input.userId,
    positionCode: input.positionCode,
    positionTitle: input.positionTitle ?? null,
    workLocation: input.workLocation ?? null,
    contactPhone: input.contactPhone ?? null,
    note: input.note ?? null,
  });
  res.status(201).json({ id });
});

// ต้องมีสิทธิ์ชมรม club_committee:manage (ตรวจใน service): โอนตำแหน่งประธาน
clubsRouter.post('/clubs/:clubId/committee/transfer-presidency', requireAuth, async (req, res) => {
  const input = transferSchema.parse(req.body);
  await transferPresidency(getRequiredAuth(req), clubIdOf(req.params.clubId), {
    userId: input.userId,
    workLocation: input.workLocation ?? null,
    contactPhone: input.contactPhone ?? null,
    note: input.note ?? null,
  });
  res.status(204).end();
});

// ต้อง login เท่านั้น (ต้องเป็นกรรมการของชมรม ตรวจใน service): ลาออกจากตำแหน่งกรรมการ
clubsRouter.post('/clubs/:clubId/committee/resign', requireAuth, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await resignFromCommittee(getRequiredAuth(req), clubIdOf(req.params.clubId), note ?? null);
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_committee:manage (ตรวจใน service): ให้กรรมการพ้นตำแหน่ง
clubsRouter.post('/clubs/:clubId/committee/:committeeMemberId/end', requireAuth, async (req, res) => {
  const { reason, note } = endTermSchema.parse(req.body);
  await endCommitteeTerm(getRequiredAuth(req), clubIdOf(req.params.clubId), committeeMemberIdOf(req.params.committeeMemberId), reason, note);
  res.status(204).end();
});
