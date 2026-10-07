import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requirePermission } from '../middlewares/auth.js';
import { PERMISSIONS } from '../services/permissions.js';
import { deactivateAccount, getAccountOverview, reactivateAccount } from '../services/user-account-service.js';
import {
  createProvisionedUser,
  getOrgUnitOptions,
  getProvisionedProfile,
  updateProvisionedUserProfile,
} from '../services/user-provisioning-service.js';
import { parseIdParam, requiredText } from './validation.js';

export const userAccountsRouter = Router();

const userIdOf = (value: unknown) => parseIdParam(value, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
const reasonSchema = z.object({ reason: requiredText(1000) }).strict();

// ---------- เพิ่มบุคลากรล่วงหน้า: ต้องมี user_account:create (ไม่ผูก role → super_admin) — ประกาศก่อน middleware ของ /user-accounts ----------

const optionalName = z.string().trim().max(100).optional().transform((value) => value || null);
const provisionSchema = z
  .object({
    email: z.email().max(200).transform((value) => value.toLowerCase()),
    prefixNameTh: requiredText(100),
    firstNameTh: requiredText(100),
    lastNameTh: requiredText(100),
    prefixNameEn: optionalName,
    firstNameEn: optionalName,
    lastNameEn: optionalName,
    orgUnitId: z.uuid(),
    positionNameTh: z.string().trim().max(200).optional().transform((value) => value || null),
  })
  .strict();
const requireCreate = requirePermission(PERMISSIONS.USER_ACCOUNT_CREATE);

userAccountsRouter.get('/provisioning/org-units', requireCreate, async (_req, res) => {
  res.json(await getOrgUnitOptions());
});

userAccountsRouter.post('/provisioned-users', requireCreate, async (req, res) => {
  const id = await createProvisionedUser(getRequiredAuth(req), provisionSchema.parse(req.body));
  res.status(201).json({ id });
});

// ข้อมูลที่กรอกของบัญชีที่ยังไม่ผูก (ผูกแล้ว = 404)
userAccountsRouter.get('/provisioned-users/:userId', requireCreate, async (req, res) => {
  res.json(await getProvisionedProfile(userIdOf(req.params.userId)));
});

userAccountsRouter.put('/provisioned-users/:userId', requireCreate, async (req, res) => {
  await updateProvisionedUserProfile(getRequiredAuth(req), userIdOf(req.params.userId), provisionSchema.parse(req.body));
  res.status(204).end();
});

// ---------- ปิด/เปิดบัญชีผู้ใช้ที่พ้นจากมหาวิทยาลัย: ทุก endpoint ต้องมี user_account:deactivate (ไม่ผูก role → super_admin) ----------
userAccountsRouter.use('/user-accounts', requirePermission(PERMISSIONS.USER_ACCOUNT_DEACTIVATE));


// ผลที่จะเกิดถ้าปิดบัญชี + ประวัติการปิด/เปิดบัญชี
userAccountsRouter.get('/user-accounts/:userId', async (req, res) => {
  res.json(await getAccountOverview(userIdOf(req.params.userId)));
});

userAccountsRouter.post('/user-accounts/:userId/deactivate', async (req, res) => {
  const { reason } = reasonSchema.parse(req.body);
  res.json(await deactivateAccount(getRequiredAuth(req), userIdOf(req.params.userId), reason));
});

userAccountsRouter.post('/user-accounts/:userId/reactivate', async (req, res) => {
  const { reason } = reasonSchema.parse(req.body);
  await reactivateAccount(getRequiredAuth(req), userIdOf(req.params.userId), reason);
  res.status(204).end();
});
