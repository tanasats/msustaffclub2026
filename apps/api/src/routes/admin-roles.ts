import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requirePermission } from '../middlewares/auth.js';
import {
  getUserRoleOverview,
  grantRole,
  listRolesForAdmin,
  listUsers,
  revokeRole,
} from '../services/role-admin-service.js';
import { PERMISSIONS } from '../services/permissions.js';
import { parseIdParam, requiredText } from './validation.js';

// จัดการ role ของผู้ใช้: ทุก endpoint ต้องมี user_role:assign (super_admin ผ่านเสมอ)
// กฎละเอียด (role สิทธิ์สูง, ห้ามแก้ของตัวเอง ฯลฯ) ตรวจใน role-admin-service
export const adminRolesRouter = Router();
adminRolesRouter.use('/admin', requirePermission(PERMISSIONS.USER_ROLE_ASSIGN));

const userIdOf = (value: unknown) => parseIdParam(value, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().transform((value) => value || null),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const roleCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,49}$/);
const grantSchema = z.object({ roleCode: roleCodeSchema, reason: requiredText(500) }).strict();
const revokeSchema = z.object({ reason: requiredText(500) }).strict();

adminRolesRouter.get('/admin/roles', async (req, res) => {
  res.json({ items: await listRolesForAdmin(getRequiredAuth(req)) });
});

adminRolesRouter.get('/admin/users', async (req, res) => {
  const { q, page, pageSize } = listQuerySchema.parse(req.query);
  res.json(await listUsers(q, page, pageSize));
});

adminRolesRouter.get('/admin/users/:userId', async (req, res) => {
  res.json(await getUserRoleOverview(userIdOf(req.params.userId)));
});

adminRolesRouter.post('/admin/users/:userId/roles', async (req, res) => {
  const { roleCode, reason } = grantSchema.parse(req.body);
  await grantRole(getRequiredAuth(req), userIdOf(req.params.userId), roleCode, reason);
  res.status(204).end();
});

// ใช้ POST .../revoke แทน DELETE เพราะต้องส่งเหตุผลใน body
adminRolesRouter.post('/admin/users/:userId/roles/:roleCode/revoke', async (req, res) => {
  const { reason } = revokeSchema.parse(req.body);
  const roleCode = roleCodeSchema.parse(req.params.roleCode);
  await revokeRole(getRequiredAuth(req), userIdOf(req.params.userId), roleCode, reason);
  res.status(204).end();
});
