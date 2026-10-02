import { pool, type Queryable } from '../db/pool.js';

// ปิด/เปิดบัญชีผู้ใช้ (เช่น พ้นจากมหาวิทยาลัย) และรายการในชมรมที่ได้รับผล

export interface AccountRecord {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
}

// ล็อกแถวผู้ใช้จนจบ transaction (กันปิด/เปิดซ้อนกัน)
export async function lockAccount(userId: string, db: Queryable): Promise<AccountRecord | null> {
  const result = await db.query<AccountRecord>(
    `SELECT id, email, name, is_active AS "isActive" FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function setAccountActive(userId: string, isActive: boolean, db: Queryable): Promise<void> {
  await db.query('UPDATE users SET is_active = $2 WHERE id = $1', [userId, isActive]);
}

// ออกจากระบบทุกอุปกรณ์ทันที (session ทั้งหมดของผู้ใช้)
export async function deleteAllSessionsOfUser(userId: string, db: Queryable): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function insertAccountEvent(
  input: { userId: string; actorUserId: string; action: 'deactivated' | 'reactivated'; reason: string; effects: Record<string, number> },
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO user_account_events (user_id, actor_user_id, action, reason, effects) VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.actorUserId, input.action, input.reason, JSON.stringify(input.effects)],
  );
}

export interface AccountEventRow {
  action: 'deactivated' | 'reactivated';
  reason: string;
  effects: Record<string, number>;
  actorName: string | null;
  createdAt: Date;
}

export async function listAccountEvents(userId: string, db: Queryable = pool): Promise<AccountEventRow[]> {
  const result = await db.query<AccountEventRow>(
    `SELECT e.action, e.reason, e.effects, a.name AS "actorName", e.created_at AS "createdAt"
       FROM user_account_events e
       LEFT JOIN users a ON a.id = e.actor_user_id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT 50`,
    [userId],
  );
  return result.rows;
}

// ---------- รายการในชมรมที่ยังมีผลของผู้ใช้ ----------

export interface CurrentMembershipRow {
  id: string;
  clubId: string;
  clubName: string;
  status: 'pending' | 'active' | 'invited';
}

// ใบสมัคร/คำเชิญ/สมาชิกภาพที่ยังมีผล ทุกชมรม พร้อมล็อกแถว (ใน transaction ล็อกจนจบ, นอก transaction ไม่มีผล)
export async function listCurrentMembershipsOfUser(userId: string, db: Queryable = pool): Promise<CurrentMembershipRow[]> {
  const result = await db.query<CurrentMembershipRow>(
    `SELECT m.id, m.club_id AS "clubId", c.name_th AS "clubName", m.status
       FROM club_memberships m
       JOIN clubs c ON c.id = m.club_id
      WHERE m.user_id = $1 AND m.status IN ('pending', 'active', 'invited')
      ORDER BY c.name_th
      LIMIT 200
      FOR UPDATE OF m`,
    [userId],
  );
  return result.rows;
}

export interface CurrentCommitteeRow {
  id: string;
  clubId: string;
  clubName: string;
  positionCode: string;
  positionTitle: string;
}

// ตำแหน่งกรรมการปัจจุบันทุกชมรม พร้อมล็อกแถว
export async function listCurrentCommitteeOfUser(userId: string, db: Queryable = pool): Promise<CurrentCommitteeRow[]> {
  const result = await db.query<CurrentCommitteeRow>(
    `SELECT cm.id, cm.club_id AS "clubId", c.name_th AS "clubName", p.code AS "positionCode", cm.position_title AS "positionTitle"
       FROM club_committee_members cm
       JOIN clubs c ON c.id = cm.club_id
       JOIN club_positions p ON p.id = cm.position_id
      WHERE cm.user_id = $1 AND cm.ended_on IS NULL
      ORDER BY c.name_th
      LIMIT 200
      FOR UPDATE OF cm`,
    [userId],
  );
  return result.rows;
}

export interface CurrentAdvisorRow {
  id: string;
  clubId: string;
  clubName: string;
}

export async function listCurrentAdvisorshipsOfUser(userId: string, db: Queryable = pool): Promise<CurrentAdvisorRow[]> {
  const result = await db.query<CurrentAdvisorRow>(
    `SELECT a.id, a.club_id AS "clubId", c.name_th AS "clubName"
       FROM club_advisors a
       JOIN clubs c ON c.id = a.club_id
      WHERE a.user_id = $1 AND a.ended_on IS NULL
      ORDER BY c.name_th
      LIMIT 200`,
    [userId],
  );
  return result.rows;
}

/**
 * สิ้นสุดการเป็นที่ปรึกษาทุกชมรม (ended_on = วันนี้ หรือวันเริ่มถ้าเริ่มวันนี้/อนาคต — ตาม CHECK dates_order)
 * คืนจำนวนแถว
 */
export async function endAdvisorshipsOfUser(userId: string, endedOn: string, db: Queryable): Promise<number> {
  const result = await db.query(
    `UPDATE club_advisors SET ended_on = GREATEST($2::date, started_on)
      WHERE user_id = $1 AND ended_on IS NULL`,
    [userId, endedOn],
  );
  return result.rowCount ?? 0;
}
