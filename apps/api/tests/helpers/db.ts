import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db/pool.js';

/**
 * ล้างข้อมูลระหว่าง test แต่คงข้อมูลตั้งต้นจาก migration (role ระบบ, permission) ไว้
 * TRUNCATE ไม่ผ่าน trigger แบบ row จึงล้าง role_change_logs ได้ (ใช้ใน test เท่านั้น)
 */
export async function resetDatabase(): Promise<void> {
  await pool.query(
    `TRUNCATE club_application_events, club_application_activities, club_application_members,
              club_application_committee, club_application_advisors, club_applications,
              club_memberships, club_committee_members, club_advisors, clubs,
              role_change_logs, sessions, user_roles, student_profiles, staff_profiles, erp_org_units, users`,
  );
  // ลบเฉพาะ role ที่ test สร้าง (role ระบบและการผูก permission จาก migration ต้องคงอยู่)
  await pool.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE NOT is_system)');
  await pool.query('DELETE FROM roles WHERE NOT is_system');
}

export interface TestUserInput {
  email?: string;
  isActive?: boolean;
}

// สร้างผู้ใช้ตรง ๆ ในฐานข้อมูล (จำลองผู้ที่เคย login ด้วย Google แล้ว)
export async function createTestUser(input: TestUserInput = {}): Promise<{ id: string; email: string }> {
  const email = input.email ?? `user-${randomUUID()}@msu.ac.th`;
  const result = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (google_sub, email, name, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email`,
    [`google-${randomUUID()}`, email, 'ผู้ใช้ทดสอบ', input.isActive ?? true],
  );
  const row = result.rows[0];
  if (!row) throw new Error('สร้างผู้ใช้ทดสอบไม่สำเร็จ');
  return row;
}

export async function getRoleId(code: string): Promise<string> {
  const result = await pool.query<{ id: string }>('SELECT id FROM roles WHERE code = $1', [code]);
  const row = result.rows[0];
  if (!row) throw new Error(`ไม่พบ role ${code}`);
  return row.id;
}
