import { Router } from 'express';
import { z } from 'zod';
import { getRequiredAuth, requirePermission } from '../middlewares/auth.js';
import { PERMISSIONS } from '../services/permissions.js';
import { deactivateAccount, getAccountOverview, reactivateAccount } from '../services/user-account-service.js';
import { parseIdParam, requiredText } from './validation.js';

// ปิด/เปิดบัญชีผู้ใช้ที่พ้นจากมหาวิทยาลัย: ทุก endpoint ต้องมี user_account:deactivate (ไม่ผูก role → super_admin)
export const userAccountsRouter = Router();
userAccountsRouter.use('/user-accounts', requirePermission(PERMISSIONS.USER_ACCOUNT_DEACTIVATE));

const userIdOf = (value: unknown) => parseIdParam(value, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
const reasonSchema = z.object({ reason: requiredText(1000) }).strict();

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
