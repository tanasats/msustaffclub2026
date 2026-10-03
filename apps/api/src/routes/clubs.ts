import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requireAuth, requireClubPermission, requirePermission } from '../middlewares/auth.js';
import { PERMISSIONS } from '../services/permissions.js';
import { CLUB_PERMISSIONS } from '../services/club-permissions.js';
import { getClubLogoUrl, setClubLogo } from '../services/club-logo-service.js';
import {
  getClubPage,
  getProposedClub,
  getProposedClubLogoUrl,
  listClubDirectory,
  listProposedClubDirectory,
} from '../services/club-service.js';
import { exportMembers, getMemberProfile, getMemberSummary, listMembers } from '../services/club-members-service.js';
import { createRenewal, getRenewalStatus } from '../services/renewal-service.js';
import {
  appointCommitteeMember,
  COMMITTEE_END_REASONS,
  endCommitteeTerm,
  getCommitteeHistory,
  resignFromCommittee,
  transferPresidency,
} from '../services/committee-service.js';
import {
  acknowledgeResignation,
  applyForMembership,
  approveMembership,
  cancelInvitation,
  cancelLeaveRequest,
  getMyInvitations,
  inviteMember,
  listInvitations,
  respondToInvitation,
  deleteMembership,
  restoreDeletedMembership,
  leaveClub,
  listMembershipRequests,
  listResignations,
  rejectMembership,
  removeMember,
  REMOVAL_REASONS,
  withdrawApplication,
} from '../services/membership-service.js';
import { redirectToImage } from './responses.js';
import { optionalText, parseIdParam, requiredText } from './validation.js';

export const clubsRouter = Router();

const listSchema = z.object({
  q: z.string().trim().max(100).optional().transform((value) => value || null),
  category: z.string().regex(/^[a-z][a-z0-9_]*$/).max(50).optional().transform((value) => value ?? null),
  mine: z.enum(['1', 'true']).optional().transform((value) => Boolean(value)),
  // 1 = เฉพาะชมรมที่มีคำขอต่อทะเบียนยื่นแล้ว
  renewing: z.enum(['1', 'true']).optional().transform((value) => Boolean(value)),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ต้อง login เท่านั้น: ทำเนียบชมรม (?mine=1 = ชมรมของฉัน)
clubsRouter.get('/clubs', requireAuth, async (req, res) => {
  const { q, category, mine, renewing, page, pageSize } = listSchema.parse(req.query);
  res.json(
    await listClubDirectory(getRequiredAuth(req), { query: q, categoryCode: category, mineOnly: mine, renewingOnly: renewing, page, pageSize }),
  );
});

// ต้อง login เท่านั้น: ชมรมที่อยู่ระหว่างขอจัดตั้ง (คำขอที่ยื่นต่อสโมสรแล้ว) — ประกาศก่อน /clubs/:clubId
clubsRouter.get('/clubs/proposed', requireAuth, async (req, res) => {
  const { q, category, page, pageSize } = listSchema.parse(req.query);
  res.json(await listProposedClubDirectory({ query: q, categoryCode: category, page, pageSize }));
});

// ต้อง login เท่านั้น: หน้าสรุปสาธารณะของชมรมที่อยู่ระหว่างขอจัดตั้ง
clubsRouter.get('/clubs/proposed/:applicationId', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.applicationId, 'PROPOSED_CLUB_NOT_FOUND', 'ไม่พบชมรมที่อยู่ระหว่างขอจัดตั้ง');
  res.json(await getProposedClub(getRequiredAuth(req), id));
});

// ต้อง login เท่านั้น: ตราของชมรมที่อยู่ระหว่างขอจัดตั้ง (redirect ไป URL อายุสั้น)
clubsRouter.get('/clubs/proposed/:applicationId/logo', requireAuth, async (req, res) => {
  const id = parseIdParam(req.params.applicationId, 'PROPOSED_CLUB_NOT_FOUND', 'ไม่พบชมรมที่อยู่ระหว่างขอจัดตั้ง');
  redirectToImage(res, await getProposedClubLogoUrl(id));
});

// ต้อง login เท่านั้น: หน้าชมรม (ข้อมูลภายในแสดงตามสิทธิ์ชมรม)
clubsRouter.get('/clubs/:clubId', requireAuth, async (req, res) => {
  res.json(await getClubPage(getRequiredAuth(req), parseIdParam(req.params.clubId, 'CLUB_NOT_FOUND', 'ไม่พบชมรม')));
});

const inviteSchema = z.object({ userId: z.uuid(), note: optionalText(1000).optional() }).strict();
const invitationResponseSchema = z.object({ decision: z.enum(['accept', 'decline']) }).strict();
const memberListSchema = pageSchema.extend({
  q: z.string().trim().max(100).optional().transform((value) => value || null),
  // deleted ต้องมี club_membership:manage_deleted (ตรวจใน service)
  status: z.enum(['active', 'ended', 'all', 'deleted']).default('active'),
  role: z.enum(['committee', 'member']).optional().transform((value) => value ?? null),
});

// ต้องมีสิทธิ์ชมรม club:view_internal: รายชื่อสมาชิก ค้นหา/กรองสถานะและบทบาท
clubsRouter.get('/clubs/:clubId/members', requireAuth, requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL), async (req, res) => {
  const { page, pageSize, q, status, role } = memberListSchema.parse(req.query);
  res.json(await listMembers(getRequiredAuth(req), { clubId: req.params.clubId as string, query: q, status, role, page, pageSize }));
});

// ต้องมีสิทธิ์ชมรม club_member:approve: ส่งออกรายชื่อเป็น CSV ตามตัวกรอง (บันทึกการส่งออก) — ประกาศก่อน /members/:userId
clubsRouter.get(
  '/clubs/:clubId/members/export',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.MEMBER_APPROVE),
  async (req, res) => {
    const { q, status, role } = memberListSchema.parse(req.query);
    const csv = await exportMembers(getRequiredAuth(req), req.params.clubId as string, { query: q, status, role });
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="club-members-${date}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  },
);

// ต้องมีสิทธิ์ชมรม club:view_internal: สรุปสมาชิก (จำนวนตามสถานะ เข้า/ออกรายเดือน หน่วยงาน) — ประกาศก่อน /members/:userId
clubsRouter.get(
  '/clubs/:clubId/members/summary',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL),
  async (req, res) => {
    res.json(await getMemberSummary(req.params.clubId as string));
  },
);

// ต้องมีสิทธิ์ชมรม club_member:approve: คำเชิญที่รอตอบของชมรม
clubsRouter.get(
  '/clubs/:clubId/invitations',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.MEMBER_APPROVE),
  async (req, res) => {
    res.json(await listInvitations(req.params.clubId as string));
  },
);

// ต้องมีสิทธิ์ชมรม club_member:approve (ตรวจใน service): เชิญบุคลากรเป็นสมาชิก
clubsRouter.post('/clubs/:clubId/invitations', requireAuth, async (req, res) => {
  const { userId, note } = inviteSchema.parse(req.body);
  await inviteMember(getRequiredAuth(req), clubIdOf(req.params.clubId), userId, note ?? null);
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_member:approve (ตรวจใน service): ยกเลิกคำเชิญที่ยังไม่ได้ตอบ
clubsRouter.post('/clubs/:clubId/memberships/:membershipId/cancel-invitation', requireAuth, async (req, res) => {
  await cancelInvitation(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId));
  res.status(204).end();
});

// ต้อง login เท่านั้น: ตอบคำเชิญของตัวเอง (ตอบรับ = เป็นสมาชิกทันที)
clubsRouter.post('/clubs/:clubId/membership/invitation', requireAuth, async (req, res) => {
  const { decision } = invitationResponseSchema.parse(req.body);
  await respondToInvitation(getRequiredAuth(req), clubIdOf(req.params.clubId), decision);
  res.status(204).end();
});

// ต้อง login เท่านั้น: คำเชิญเข้าชมรมที่รอฉันตอบ
clubsRouter.get('/me/club-invitations', requireAuth, async (req, res) => {
  res.json(await getMyInvitations(getRequiredAuth(req)));
});

// ต้องมีสิทธิ์ชมรม club:view_internal: ข้อมูลรายบุคคลของสมาชิก (ผลงาน/กิจกรรม/ตำแหน่ง/ประวัติในชมรมนี้)
clubsRouter.get(
  '/clubs/:clubId/members/:userId',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL),
  async (req, res) => {
    const userId = parseIdParam(req.params.userId, 'MEMBER_NOT_FOUND', 'ไม่พบสมาชิกคนนี้ในชมรม');
    res.json(await getMemberProfile(getRequiredAuth(req), req.params.clubId as string, userId));
  },
);

// ---------- สมาชิกภาพ ----------

const clubIdOf = (value: unknown) => parseIdParam(value, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
const membershipIdOf = (value: unknown) => parseIdParam(value, 'MEMBERSHIP_NOT_FOUND', 'ไม่พบใบสมัครหรือสมาชิกภาพ');
const noteSchema = z.object({ note: optionalText(1000).optional() }).strict();
const requiredNoteSchema = z.object({ note: requiredText(1000) }).strict();
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

// ต้อง login เท่านั้น: ยื่นลาออกจากชมรม (ต้องมีเหตุผล) → กรรมการรับทราบ หรือมีผลอัตโนมัติเมื่อครบกำหนด
clubsRouter.post('/clubs/:clubId/membership/leave', requireAuth, async (req, res) => {
  const { note } = requiredNoteSchema.parse(req.body ?? {});
  await leaveClub(getRequiredAuth(req), clubIdOf(req.params.clubId), note);
  res.status(204).end();
});

// ต้อง login เท่านั้น: ยกเลิกคำขอลาออกของตัวเอง
clubsRouter.post('/clubs/:clubId/membership/leave/cancel', requireAuth, async (req, res) => {
  await cancelLeaveRequest(getRequiredAuth(req), clubIdOf(req.params.clubId));
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_member:approve: คำขอลาออกที่รอรับทราบ
clubsRouter.get(
  '/clubs/:clubId/resignation-requests',
  requireAuth,
  requireClubPermission(CLUB_PERMISSIONS.MEMBER_APPROVE),
  async (req, res) => {
    res.json(await listResignations(req.params.clubId as string));
  },
);

// ต้องมีสิทธิ์ชมรม club_member:approve (ตรวจใน service): รับทราบการลาออก (ปฏิเสธไม่ได้ ตามระเบียบข้อ 20(3))
clubsRouter.post('/clubs/:clubId/memberships/:membershipId/acknowledge-resignation', requireAuth, async (req, res) => {
  const { note } = noteSchema.parse(req.body ?? {});
  await acknowledgeResignation(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), note ?? null);
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

// ปฏิเสธต้องมีเหตุผลเสมอ (ผู้สมัครเห็นเหตุผลที่หน้าชมรม)
clubsRouter.post('/clubs/:clubId/memberships/:membershipId/reject', requireAuth, async (req, res) => {
  const { note } = requiredNoteSchema.parse(req.body ?? {});
  await rejectMembership(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), note);
  res.status(204).end();
});

clubsRouter.post('/clubs/:clubId/memberships/:membershipId/remove', requireAuth, async (req, res) => {
  const { reason, note } = removeSchema.parse(req.body);
  await removeMember(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), reason, note);
  res.status(204).end();
});

// ต้องมีสิทธิ์ชมรม club_member:approve (ตรวจใน service): ลบรายชื่อที่บันทึกผิด (soft delete) ต้องมีเหตุผล
clubsRouter.post('/clubs/:clubId/memberships/:membershipId/delete', requireAuth, async (req, res) => {
  const { note } = requiredNoteSchema.parse(req.body ?? {});
  await deleteMembership(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), note);
  res.status(204).end();
});

// ต้องมี club_membership:manage_deleted (super_admin): กู้คืนรายชื่อที่ถูกลบ ต้องมีเหตุผล
clubsRouter.post(
  '/clubs/:clubId/memberships/:membershipId/restore',
  requireAuth,
  requirePermission(PERMISSIONS.CLUB_MEMBERSHIP_MANAGE_DELETED),
  async (req, res) => {
    const { note } = requiredNoteSchema.parse(req.body ?? {});
    await restoreDeletedMembership(getRequiredAuth(req), clubIdOf(req.params.clubId), membershipIdOf(req.params.membershipId), note);
    res.status(204).end();
  },
);

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

// ---------- ตราสัญลักษณ์ ----------

const logoSchema = z.object({ fileId: z.uuid().nullable() }).strict();

// ต้อง login เท่านั้น: รูปตราของชมรม (ข้อมูลสาธารณะของชมรม)
clubsRouter.get('/clubs/:clubId/logo', requireAuth, async (req, res) => {
  redirectToImage(res, await getClubLogoUrl(clubIdOf(req.params.clubId)));
});

// ต้องมีสิทธิ์ชมรม club_profile:edit (ตรวจใน service): แนบ/เปลี่ยน/ลบตรา (fileId = null)
clubsRouter.put('/clubs/:clubId/logo', requireAuth, async (req, res) => {
  const { fileId } = logoSchema.parse(req.body);
  await setClubLogo(getRequiredAuth(req), clubIdOf(req.params.clubId), fileId);
  res.status(204).end();
});

// ---------- ต่อทะเบียน ----------

// ต้องมีสิทธิ์ชมรม club:view_internal: สถานะการต่อทะเบียน (ช่วงเวลา, คำขอปีถัดไป)
clubsRouter.get('/clubs/:clubId/renewal', requireAuth, requireClubPermission(CLUB_PERMISSIONS.VIEW_INTERNAL), async (req, res) => {
  res.json(await getRenewalStatus(getRequiredAuth(req), req.params.clubId as string));
});

// ต้องมีสิทธิ์ชมรม club_report:submit (ตรวจใน service): ยื่นต่อทะเบียน (สร้างคำขอฉบับร่าง)
clubsRouter.post('/clubs/:clubId/renewals', requireAuth, async (req, res) => {
  res.status(201).json({ id: await createRenewal(getRequiredAuth(req), clubIdOf(req.params.clubId)) });
});
