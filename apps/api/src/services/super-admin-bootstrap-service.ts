import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { lockRoleByCode } from '../repositories/roles-repository.js';
import { findUsersByEmail } from '../repositories/users-repository.js';
import { countActiveUsersWithRole, insertUserRole, userHasRole } from '../repositories/user-roles-repository.js';
import { insertRoleChangeLog } from '../repositories/role-change-logs-repository.js';
import { SYSTEM_ROLES } from './permissions.js';

export interface BootstrapSuperAdminResult {
  status: 'granted' | 'already_super_admin';
  userId: string;
}

export const BOOTSTRAP_REASON = 'สร้างผู้ดูแลระบบสูงสุดคนแรกผ่าน seed script';

/**
 * ให้ role super_admin แก่ผู้ใช้คนแรกของระบบ (เรียกจาก seed script เท่านั้น ห้ามเปิดผ่าน API)
 * - ผู้ใช้ต้อง login ด้วย Google มาแล้ว 1 ครั้ง (ต้องมี google_sub ในระบบก่อน)
 * - ถ้ามี super_admin ที่ใช้งานได้อยู่แล้ว จะปฏิเสธ (คนต่อไปต้องให้ผ่านระบบปกติ)
 * - รันซ้ำกับคนเดิมได้ ไม่สร้างซ้ำ
 */
export async function bootstrapSuperAdmin(rawEmail: string): Promise<BootstrapSuperAdminResult> {
  const email = rawEmail.trim().toLowerCase();

  return withTransaction(async (client) => {
    // ล็อกแถว role super_admin ก่อน กันรัน seed พร้อมกัน 2 ครั้งแล้วได้ super_admin 2 คน
    const role = await lockRoleByCode(SYSTEM_ROLES.SUPER_ADMIN, client);
    if (!role) {
      throw new AppError(500, 'ROLE_NOT_FOUND', 'ไม่พบ role super_admin (ยังไม่ได้รัน migration หรือไม่)');
    }

    const users = await findUsersByEmail(email, client);
    const [user, ...others] = users;
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้ email นี้ ให้เข้าสู่ระบบด้วย Google 1 ครั้งก่อนรัน seed');
    }
    if (others.length > 0) {
      throw new AppError(409, 'AMBIGUOUS_EMAIL', 'มีผู้ใช้มากกว่า 1 บัญชีที่ใช้ email นี้ ต้องตรวจสอบข้อมูลก่อน');
    }
    if (!user.isActive) {
      throw new AppError(409, 'USER_INACTIVE', 'บัญชีผู้ใช้นี้ถูกปิดการใช้งาน');
    }

    if (await userHasRole(user.id, role.id, client)) {
      return { status: 'already_super_admin', userId: user.id };
    }

    // นับเฉพาะ super_admin ที่ยังใช้งานได้ ถ้าทุกคนถูกปิดบัญชี seed ใช้กู้ระบบได้
    if ((await countActiveUsersWithRole(role.id, client)) > 0) {
      throw new AppError(409, 'SUPER_ADMIN_EXISTS', 'มีผู้ดูแลระบบสูงสุดอยู่แล้ว ให้กำหนดสิทธิ์ผ่านระบบแทน');
    }

    // ให้ role และเขียน log ใน transaction เดียวกัน: สำเร็จพร้อมกันหรือไม่เกิดขึ้นเลย
    await insertUserRole({ userId: user.id, roleId: role.id, grantedBy: null }, client);
    await insertRoleChangeLog(
      { actorUserId: null, targetUserId: user.id, roleId: role.id, action: 'grant', reason: BOOTSTRAP_REASON },
      client,
    );

    return { status: 'granted', userId: user.id };
  });
}
