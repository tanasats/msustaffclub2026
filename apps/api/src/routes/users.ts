import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../middlewares/auth.js';
import { searchActiveUsers } from '../repositories/users-repository.js';
import { isEligibleForClub } from '../services/club-rules.js';
import { PERMISSIONS } from '../services/permissions.js';

export const usersRouter = Router();

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

/**
 * ค้นหาผู้ใช้เพื่อเลือกเป็นกรรมการ/สมาชิก/ที่ปรึกษาในคำขอ
 * ต้องมี club_application:create (ข้อมูลรายชื่อบุคลากรไม่เปิดให้ทุกคนที่ login)
 * คืนเฉพาะบัญชีที่มีสิทธิ์เป็นสมาชิกชมรม
 */
usersRouter.get('/users/search', requirePermission(PERMISSIONS.CLUB_APPLICATION_CREATE), async (req, res) => {
  const { q } = searchQuerySchema.parse(req.query);
  // ดึงเผื่อไว้แล้วกรองบัญชีที่ไม่มีสิทธิ์ออก ให้เหลือไม่เกิน 20 รายการ
  const users = (await searchActiveUsers(q, 50)).filter((user) => isEligibleForClub(user.email)).slice(0, 20);
  res.json({ items: users.map(({ id, email, name, orgUnitName }) => ({ id, email, name, orgUnitName })) });
});
