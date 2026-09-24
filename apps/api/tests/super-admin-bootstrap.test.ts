import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { AppError } from '../src/errors.js';
import { SYSTEM_ROLES } from '../src/services/permissions.js';
import { BOOTSTRAP_REASON, bootstrapSuperAdmin } from '../src/services/super-admin-bootstrap-service.js';
import { createTestUser, getRoleId, resetDatabase } from './helpers/db.js';

beforeEach(resetDatabase);

async function superAdminIds(): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = $1`,
    [SYSTEM_ROLES.SUPER_ADMIN],
  );
  return rows.map((row) => row.user_id);
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const err = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
}

describe('bootstrapSuperAdmin', () => {
  it('ให้ role super_admin และเขียน role_change_logs', async () => {
    const user = await createTestUser({ email: 'admin@msu.ac.th' });

    const result = await bootstrapSuperAdmin('Admin@MSU.ac.th');

    expect(result).toEqual({ status: 'granted', userId: user.id });
    expect(await superAdminIds()).toEqual([user.id]);
    const { rows } = await pool.query(
      'SELECT actor_user_id, target_user_id, role_id, action, reason FROM role_change_logs',
    );
    expect(rows).toEqual([
      {
        actor_user_id: null,
        target_user_id: user.id,
        role_id: await getRoleId(SYSTEM_ROLES.SUPER_ADMIN),
        action: 'grant',
        reason: BOOTSTRAP_REASON,
      },
    ]);
  });

  it('รันซ้ำกับคนเดิมไม่สร้างซ้ำและไม่เขียน log เพิ่ม', async () => {
    const user = await createTestUser({ email: 'admin@msu.ac.th' });
    await bootstrapSuperAdmin('admin@msu.ac.th');

    const second = await bootstrapSuperAdmin('admin@msu.ac.th');

    expect(second).toEqual({ status: 'already_super_admin', userId: user.id });
    const { rows } = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM role_change_logs');
    expect(rows[0]?.count).toBe(1);
  });

  it('ปฏิเสธเมื่อยังไม่มีผู้ใช้ email นี้ (ยังไม่เคย login)', async () => {
    await expectAppError(bootstrapSuperAdmin('nobody@msu.ac.th'), 'USER_NOT_FOUND');
  });

  it('ปฏิเสธผู้ใช้ที่ถูกปิดการใช้งาน', async () => {
    await createTestUser({ email: 'admin@msu.ac.th', isActive: false });
    await expectAppError(bootstrapSuperAdmin('admin@msu.ac.th'), 'USER_INACTIVE');
    expect(await superAdminIds()).toEqual([]);
  });

  it('ปฏิเสธเมื่อมี super_admin คนอื่นอยู่แล้ว', async () => {
    const first = await createTestUser({ email: 'first@msu.ac.th' });
    await createTestUser({ email: 'second@msu.ac.th' });
    await bootstrapSuperAdmin('first@msu.ac.th');

    await expectAppError(bootstrapSuperAdmin('second@msu.ac.th'), 'SUPER_ADMIN_EXISTS');
    expect(await superAdminIds()).toEqual([first.id]);
  });

  it('รอ lock ของ role super_admin ก่อนตรวจ จึงไม่เกิด super_admin 2 คนเมื่อรันพร้อมกัน', async () => {
    await createTestUser({ email: 'a@msu.ac.th' });
    const other = await createTestUser({ email: 'b@msu.ac.th' });
    const superAdminRoleId = await getRoleId(SYSTEM_ROLES.SUPER_ADMIN);

    // จำลอง transaction อื่นที่ถือ lock แถว super_admin อยู่ และกำลังให้สิทธิ์ผู้ใช้ b
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM roles WHERE id = $1 FOR UPDATE', [superAdminRoleId]);

      let finished = false;
      const pending = bootstrapSuperAdmin('a@msu.ac.th').finally(() => {
        finished = true;
      });
      pending.catch(() => {}); // กัน unhandled rejection ระหว่างรอ (ตรวจผลจริงด้านล่าง)

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(finished).toBe(false); // ต้องค้างรอ lock อยู่ ยังไม่ได้ตรวจข้อมูล

      await blocker.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [other.id, superAdminRoleId]);
      await blocker.query('COMMIT');

      // เมื่อได้ lock แล้วต้องเห็นว่ามี super_admin อยู่แล้ว
      await expectAppError(pending, 'SUPER_ADMIN_EXISTS');
      expect(await superAdminIds()).toEqual([other.id]);
    } finally {
      blocker.release();
    }
  });
});
