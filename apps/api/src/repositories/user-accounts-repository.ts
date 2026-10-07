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
  input: { userId: string; actorUserId: string; action: AccountEventAction; reason: string; effects: Record<string, number> },
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO user_account_events (user_id, actor_user_id, action, reason, effects) VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.actorUserId, input.action, input.reason, JSON.stringify(input.effects)],
  );
}

export type AccountEventAction = 'deactivated' | 'reactivated' | 'created' | 'updated' | 'linked';

export interface AccountEventRow {
  action: AccountEventAction;
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

// ---------- บัญชีที่ผู้ดูแลเพิ่มล่วงหน้า (ยังไม่ผูกกับบัญชี Google) ----------

export interface ProvisionedProfileInput {
  email: string;
  prefixNameTh: string;
  firstNameTh: string;
  lastNameTh: string;
  prefixNameEn: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  orgUnitId: string;
  positionNameTh: string | null;
}

// มีบัญชีที่ใช้งานอยู่ (ผูกแล้วหรือยัง) ด้วยอีเมลนี้หรือไม่ (ยกเว้นบัญชี excludeUserId — ใช้ตอนแก้ไข)
export async function hasActiveUserWithEmail(email: string, excludeUserId: string | null, db: Queryable): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1 AND is_active AND ($2::uuid IS NULL OR id <> $2)) AS "exists"`,
    [email, excludeUserId],
  );
  return result.rows[0]?.exists ?? false;
}

// สร้างบัญชีที่ยังไม่ผูก (google_sub ว่าง) — ชื่อแสดง = "ชื่อ นามสกุล" ไทย เหมือนชื่อจาก ERP
// อีเมลซ้ำกับบัญชีที่ยังไม่ผูกอื่นจะชน unique index users_unlinked_email_key → 23505
export async function insertProvisionedUser(input: ProvisionedProfileInput, createdBy: string, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO users (google_sub, email, name, created_by) VALUES (NULL, $1, $2, $3) RETURNING id`,
    [input.email, `${input.firstNameTh} ${input.lastNameTh}`, createdBy],
  );
  return result.rows[0]!.id;
}

// ข้อมูลบุคลากรที่ผู้ดูแลกรอก (source = admin, ไม่มีรหัสบุคลากร) ถูกแทนด้วยข้อมูล ERP เมื่อเจ้าตัว login
export async function upsertProvisionedStaffProfile(userId: string, input: ProvisionedProfileInput, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO staff_profiles (user_id, staff_code, prefix_name_th, first_name_th, last_name_th,
                                prefix_name_en, first_name_en, last_name_en, position_name_th, org_unit_id, source, synced_at)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, 'admin', now())
     ON CONFLICT (user_id) DO UPDATE
        SET prefix_name_th = EXCLUDED.prefix_name_th, first_name_th = EXCLUDED.first_name_th, last_name_th = EXCLUDED.last_name_th,
            prefix_name_en = EXCLUDED.prefix_name_en, first_name_en = EXCLUDED.first_name_en, last_name_en = EXCLUDED.last_name_en,
            position_name_th = EXCLUDED.position_name_th, org_unit_id = EXCLUDED.org_unit_id, synced_at = now()
      WHERE staff_profiles.source = 'admin'`,
    [
      userId,
      input.prefixNameTh,
      input.firstNameTh,
      input.lastNameTh,
      input.prefixNameEn,
      input.firstNameEn,
      input.lastNameEn,
      input.positionNameTh,
      input.orgUnitId,
    ],
  );
}

// แก้ข้อมูลบัญชีที่ยังไม่ผูก (ผูกแล้ว = ข้อมูลตาม ERP แก้ที่นี่ไม่ได้) คืน false ถ้าไม่ใช่บัญชีที่ยังไม่ผูก
export async function updateProvisionedUser(userId: string, input: ProvisionedProfileInput, db: Queryable): Promise<boolean> {
  const result = await db.query(
    `UPDATE users SET email = $2, name = $3 WHERE id = $1 AND google_sub IS NULL`,
    [userId, input.email, `${input.firstNameTh} ${input.lastNameTh}`],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface ProvisionedProfile extends ProvisionedProfileInput {
  createdByName: string | null;
  createdAt: Date;
}

// ข้อมูลที่ผู้ดูแลกรอกของบัญชีที่ยังไม่ผูก (null = ผูกแล้ว/ไม่ใช่บัญชีที่เพิ่มล่วงหน้า)
export async function findProvisionedProfile(userId: string, db: Queryable = pool): Promise<ProvisionedProfile | null> {
  const result = await db.query<ProvisionedProfile>(
    `SELECT u.email, sp.prefix_name_th AS "prefixNameTh", sp.first_name_th AS "firstNameTh", sp.last_name_th AS "lastNameTh",
            sp.prefix_name_en AS "prefixNameEn", sp.first_name_en AS "firstNameEn", sp.last_name_en AS "lastNameEn",
            sp.org_unit_id AS "orgUnitId", sp.position_name_th AS "positionNameTh",
            c.name AS "createdByName", u.created_at AS "createdAt"
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN users c ON c.id = u.created_by
      WHERE u.id = $1 AND u.google_sub IS NULL`,
    [userId],
  );
  return result.rows[0] ?? null;
}
