import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requirePermission } from '../middlewares/auth.js';
import {
  createRole,
  editRole,
  getPermissionChangeLogs,
  getPermissionHolders,
  getPermissionOverview,
  grantPositionPermission,
  grantRolePermission,
  revokePositionPermission,
  revokeRolePermission,
} from '../services/permission-admin-service.js';
import { PERMISSIONS } from '../services/permissions.js';
import { optionalText, requiredText } from './validation.js';

// สิทธิ์ในระบบ: ทุก route ต้องมี role_permission:manage (ไม่ผูก role → super_admin)
// mount ก่อน adminRolesRouter (router นั้นบังคับ user_role:assign กับทุก path /admin)
export const permissionAdminRouter = Router();
const requireManage = requirePermission(PERMISSIONS.ROLE_PERMISSION_MANAGE);

const codeParam = z.string().trim().min(1).max(100);
const reasonSchema = z.object({ reason: requiredText(1000) }).strict();
const roleFields = {
  nameTh: requiredText(100),
  description: optionalText(500).optional().transform((value) => value ?? null),
  isPrivileged: z.boolean(),
  reason: requiredText(1000),
};
const createRoleSchema = z
  .object({ code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,49}$/, 'รหัส role ใช้ a-z 0-9 _ ขึ้นต้นด้วยตัวอักษร 2–50 ตัว'), ...roleFields })
  .strict();
const editRoleSchema = z.object(roleFields).strict();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });

permissionAdminRouter.get('/admin/permissions', requireManage, async (_req, res) => {
  res.json(await getPermissionOverview());
});

permissionAdminRouter.get('/admin/permissions/:code/holders', requireManage, async (req, res) => {
  res.json(await getPermissionHolders(codeParam.parse(req.params.code)));
});

permissionAdminRouter.get('/admin/permission-change-logs', requireManage, async (req, res) => {
  res.json(await getPermissionChangeLogs(pageSchema.parse(req.query).page));
});

permissionAdminRouter.post('/admin/roles', requireManage, async (req, res) => {
  const { code, reason, ...input } = createRoleSchema.parse(req.body);
  res.status(201).json(await createRole(getRequiredAuth(req), code, input, reason));
});

permissionAdminRouter.patch('/admin/roles/:roleCode', requireManage, async (req, res) => {
  const { reason, ...input } = editRoleSchema.parse(req.body);
  await editRole(getRequiredAuth(req), codeParam.parse(req.params.roleCode), input, reason);
  res.status(204).end();
});

permissionAdminRouter.post('/admin/roles/:roleCode/permissions', requireManage, async (req, res) => {
  const { permissionCode, reason } = z.object({ permissionCode: codeParam, reason: requiredText(1000) }).strict().parse(req.body);
  res.json(await grantRolePermission(getRequiredAuth(req), codeParam.parse(req.params.roleCode), permissionCode, reason));
});

permissionAdminRouter.post('/admin/roles/:roleCode/permissions/:permissionCode/revoke', requireManage, async (req, res) => {
  const { reason } = reasonSchema.parse(req.body);
  res.json(
    await revokeRolePermission(getRequiredAuth(req), codeParam.parse(req.params.roleCode), codeParam.parse(req.params.permissionCode), reason),
  );
});

permissionAdminRouter.post('/admin/club-positions/:positionCode/permissions', requireManage, async (req, res) => {
  const { clubPermissionCode, reason } = z.object({ clubPermissionCode: codeParam, reason: requiredText(1000) }).strict().parse(req.body);
  await grantPositionPermission(getRequiredAuth(req), codeParam.parse(req.params.positionCode), clubPermissionCode, reason);
  res.status(204).end();
});

permissionAdminRouter.post('/admin/club-positions/:positionCode/permissions/:clubPermissionCode/revoke', requireManage, async (req, res) => {
  const { reason } = reasonSchema.parse(req.body);
  await revokePositionPermission(
    getRequiredAuth(req),
    codeParam.parse(req.params.positionCode),
    codeParam.parse(req.params.clubPermissionCode),
    reason,
  );
  res.status(204).end();
});
