import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db/pool.js';

// ตัวช่วยสร้างข้อมูลชมรมตรง ๆ ในฐานข้อมูล (ใช้ใน test เท่านั้น)

export async function createTestClub(input: { name?: string; status?: 'active' | 'suspended' | 'dissolved' } = {}) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO clubs (name_th, category_id, status, established_on, registered_until)
     SELECT $1, id, $2, DATE '2026-01-01', DATE '2026-09-30' FROM club_categories WHERE code = 'academic'
     RETURNING id`,
    [input.name ?? `ชมรมทดสอบ ${randomUUID()}`, input.status ?? 'active'],
  );
  return rows[0]!.id;
}

export async function addCommittee(
  clubId: string,
  userId: string,
  positionCode: string,
  options: { ended?: boolean } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO club_committee_members (club_id, user_id, position_id, position_title, started_on, ended_on, end_reason)
     SELECT $1, $2, id, name_th, DATE '2026-01-01',
            CASE WHEN $4 THEN DATE '2026-06-01' END,
            CASE WHEN $4 THEN 'resigned_position' END
       FROM club_positions WHERE code = $3`,
    [clubId, userId, positionCode, options.ended ?? false],
  );
}

export async function addAdvisor(clubId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO club_advisors (club_id, user_id, fiscal_year, started_on) VALUES ($1, $2, 2569, DATE '2026-01-01')`,
    [clubId, userId],
  );
}

export async function addMembership(
  clubId: string,
  userId: string,
  status: 'pending' | 'active' | 'rejected' = 'active',
): Promise<void> {
  await pool.query('INSERT INTO club_memberships (club_id, user_id, status) VALUES ($1, $2, $3)', [
    clubId,
    userId,
    status,
  ]);
}
