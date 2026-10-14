import { pool, type Queryable } from '../db/pool.js';
import type { Recipient } from './notification-recipients-repository.js';

export type StaffAudience = 'all_staff' | 'club_committees' | 'club_members' | 'org_units';
export type BroadcastKind = 'staff_announcement' | 'club_message';

/**
 * ผู้รับประกาศของสโมสรตามกลุ่ม (บัญชีที่ใช้งานอยู่เท่านั้น ไม่รวมผู้ส่ง) — เลือกกลุ่มด้วย CASE บนค่าพารามิเตอร์ ไม่ต่อสตริง SQL
 * - all_staff: บัญชีที่มี role บุคลากร (role ประเภทบัญชีที่ระบบให้ตอน login — ใช้ระบุกลุ่มผู้รับ ไม่ใช่ตรวจสิทธิ์)
 * - club_committees: กรรมการที่ยังอยู่ในตำแหน่งของชมรมที่ดำเนินการอยู่
 * - club_members: สมาชิก active ของชมรมที่ดำเนินการอยู่
 * - org_units: บุคลากรที่สังกัดหน่วยงานที่เลือก (staff_profiles.org_unit_id)
 * limit = เพดานจำนวน (service ตรวจว่าเกินหรือไม่ด้วยการขอเกิน 1 แถว)
 */
export async function listStaffAudience(
  audience: StaffAudience,
  orgUnitIds: string[],
  excludeUserId: string,
  limit: number,
  db: Queryable = pool,
): Promise<Recipient[]> {
  const result = await db.query<Recipient>(
    `SELECT u.id AS "userId", u.email, u.name
       FROM users u
      WHERE u.is_active
        AND u.id <> $3
        AND CASE $1::text
              WHEN 'all_staff' THEN EXISTS (
                SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id AND r.code = 'staff')
              WHEN 'club_committees' THEN EXISTS (
                SELECT 1 FROM club_committee_members cm JOIN clubs c ON c.id = cm.club_id
                 WHERE cm.user_id = u.id AND cm.ended_on IS NULL AND c.status = 'active' AND c.deleted_at IS NULL)
              WHEN 'club_members' THEN EXISTS (
                SELECT 1 FROM club_memberships m JOIN clubs c ON c.id = m.club_id
                 WHERE m.user_id = u.id AND m.status = 'active' AND c.status = 'active' AND c.deleted_at IS NULL)
              WHEN 'org_units' THEN EXISTS (
                SELECT 1 FROM staff_profiles sp WHERE sp.user_id = u.id AND sp.org_unit_id = ANY($2::uuid[]))
              ELSE false
            END
      ORDER BY u.id
      LIMIT $4`,
    [audience, orgUnitIds, excludeUserId, limit],
  );
  return result.rows;
}

// สมาชิก active ของชมรม (บัญชีที่ใช้งานอยู่ ไม่รวมผู้ส่ง) — กรรมการทุกคนเป็นสมาชิกด้วยจึงได้รับด้วย
export async function listClubMemberAudience(clubId: string, excludeUserId: string, limit: number, db: Queryable = pool): Promise<Recipient[]> {
  const result = await db.query<Recipient>(
    `SELECT u.id AS "userId", u.email, u.name
       FROM club_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = $1 AND m.status = 'active' AND u.is_active AND u.id <> $2
      ORDER BY u.id
      LIMIT $3`,
    [clubId, excludeUserId, limit],
  );
  return result.rows;
}

// หน่วยงานที่เลือกมีอยู่จริงครบทุกรายการหรือไม่
export async function countExistingOrgUnits(orgUnitIds: string[], db: Queryable = pool): Promise<number> {
  const result = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM org_units WHERE id = ANY($1::uuid[])', [orgUnitIds]);
  return result.rows[0]?.count ?? 0;
}

export async function findClubName(clubId: string, db: Queryable = pool): Promise<string | null> {
  const result = await db.query<{ nameTh: string }>('SELECT name_th AS "nameTh" FROM clubs WHERE id = $1 AND deleted_at IS NULL', [clubId]);
  return result.rows[0]?.nameTh ?? null;
}

export interface NewBroadcastMessage {
  kind: BroadcastKind;
  senderUserId: string;
  clubId: string | null;
  audience: StaffAudience | 'club';
  orgUnitIds: string[] | null;
  title: string;
  body: string;
  recipientCount: number;
}

export async function insertBroadcastMessage(input: NewBroadcastMessage, db: Queryable): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO broadcast_messages (kind, sender_user_id, club_id, audience, org_unit_ids, title, body, recipient_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [input.kind, input.senderUserId, input.clubId, input.audience, input.orgUnitIds, input.title, input.body, input.recipientCount],
  );
  return result.rows[0]!.id;
}

export interface BroadcastMessageItem {
  id: string;
  audience: string;
  orgUnitNames: string[];
  title: string;
  body: string;
  recipientCount: number;
  senderName: string | null;
  createdAt: Date;
}

// ประวัติการส่ง ใหม่สุดก่อน (club_message กรองตามชมรม) พร้อมชื่อผู้ส่งและชื่อหน่วยงานที่เลือก
export async function listBroadcastMessages(
  kind: BroadcastKind,
  clubId: string | null,
  limit: number,
  offset: number,
  db: Queryable = pool,
): Promise<{ items: BroadcastMessageItem[]; total: number }> {
  const [items, total] = await Promise.all([
    db.query<BroadcastMessageItem>(
      `SELECT b.id, b.audience,
              COALESCE((SELECT array_agg(o.name_th ORDER BY o.name_th) FROM org_units o WHERE o.id = ANY(b.org_unit_ids)), '{}') AS "orgUnitNames",
              b.title, b.body, b.recipient_count AS "recipientCount", s.name AS "senderName", b.created_at AS "createdAt"
         FROM broadcast_messages b JOIN users s ON s.id = b.sender_user_id
        WHERE b.kind = $1 AND ($2::uuid IS NULL OR b.club_id = $2)
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT $3 OFFSET $4`,
      [kind, clubId, limit, offset],
    ),
    db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM broadcast_messages WHERE kind = $1 AND ($2::uuid IS NULL OR club_id = $2)',
      [kind, clubId],
    ),
  ]);
  return { items: items.rows, total: total.rows[0]?.count ?? 0 };
}
