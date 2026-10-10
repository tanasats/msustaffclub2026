import { pool, type Queryable } from '../db/pool.js';

export interface NewNotification {
  userId: string;
  kind: string;
  dedupeKey: string;
  title: string;
  body: string;
  linkPath: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkPath: string;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * เพิ่มการแจ้งเตือนหลายรายการในคำสั่งเดียว (unnest ของ array ต่อคอลัมน์)
 * ON CONFLICT (dedupe_key) DO NOTHING = เหตุการณ์เดิมถึงผู้ใช้เดิมไม่ซ้ำ
 */
export async function insertNotifications(items: NewNotification[], db: Queryable): Promise<number> {
  if (items.length === 0) return 0;
  const result = await db.query(
    `INSERT INTO notifications (user_id, kind, dedupe_key, title, body, link_path)
     SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      items.map((n) => n.userId),
      items.map((n) => n.kind),
      items.map((n) => n.dedupeKey),
      items.map((n) => n.title),
      items.map((n) => n.body),
      items.map((n) => n.linkPath),
    ],
  );
  return result.rowCount ?? 0;
}

// รายการของผู้ใช้ ใหม่สุดก่อน (แบ่งหน้า) — ใช้ index (user_id, created_at DESC)
export async function listNotifications(
  userId: string,
  limit: number,
  offset: number,
  db: Queryable = pool,
): Promise<{ items: NotificationItem[]; total: number }> {
  const [items, total] = await Promise.all([
    db.query<NotificationItem>(
      `SELECT id, kind, title, body, link_path AS "linkPath", read_at AS "readAt", created_at AS "createdAt"
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    db.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1', [userId]),
  ]);
  return { items: items.rows, total: total.rows[0]?.count ?? 0 };
}

// จำนวนที่ยังไม่อ่าน (ตัวเลขบนกระดิ่ง) — ใช้ partial index notifications_unread_idx
export async function countUnreadNotifications(userId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

// ทำเครื่องหมายอ่านแล้ว 1 รายการ — กรอง user_id ด้วย เพื่อไม่ให้แก้ของคนอื่น; คืน false ถ้าไม่พบ
export async function markNotificationRead(userId: string, id: string, db: Queryable = pool): Promise<boolean> {
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// อ่านทั้งหมด (เฉพาะที่ยังไม่อ่าน)
export async function markAllNotificationsRead(userId: string, db: Queryable = pool): Promise<number> {
  const result = await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return result.rowCount ?? 0;
}

// ลบรายการที่เก่ากว่า retentionDays วัน (งานตามรอบ)
export async function deleteOldNotifications(retentionDays: number, db: Queryable = pool): Promise<number> {
  const result = await db.query(
    'DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1::int)',
    [retentionDays],
  );
  return result.rowCount ?? 0;
}
