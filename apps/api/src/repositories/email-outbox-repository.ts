import { pool, type Queryable } from '../db/pool.js';

export interface NewOutboxEmail {
  kind: string;
  dedupeKey: string;
  recipientUserId: string | null;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

/**
 * เพิ่มอีเมลลงคิวหลายฉบับในคำสั่งเดียว (unnest ของ array ต่อคอลัมน์)
 * ON CONFLICT (dedupe_key) DO NOTHING = เหตุการณ์เดิมถึงผู้รับเดิมไม่ซ้ำ
 */
export async function insertOutboxEmails(emails: NewOutboxEmail[], db: Queryable): Promise<number> {
  if (emails.length === 0) return 0;
  const result = await db.query(
    `INSERT INTO email_outbox (kind, dedupe_key, recipient_user_id, recipient_email, subject, body_text, body_html)
     SELECT * FROM unnest($1::text[], $2::text[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[])
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      emails.map((e) => e.kind),
      emails.map((e) => e.dedupeKey),
      emails.map((e) => e.recipientUserId),
      emails.map((e) => e.recipientEmail.toLowerCase()),
      emails.map((e) => e.subject),
      emails.map((e) => e.bodyText),
      emails.map((e) => e.bodyHtml),
    ],
  );
  return result.rowCount ?? 0;
}

export interface ClaimedEmail {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attempts: number;
}

/**
 * จองอีเมลที่ถึงเวลาส่ง: เปลี่ยนเป็น sending นับจำนวนครั้ง และตั้ง "สัญญาเช่า" (next_attempt_at = now + leaseMinutes)
 * ถ้า worker ล่มกลางทาง แถวจะถูกคืนเมื่อพ้นสัญญาเช่า (releaseExpiredLeases)
 * FOR UPDATE SKIP LOCKED = worker หลายตัว (ถ้ามี) ไม่หยิบแถวเดียวกัน
 */
export async function claimDueEmails(limit: number, leaseMinutes: number, db: Queryable = pool): Promise<ClaimedEmail[]> {
  const result = await db.query<ClaimedEmail>(
    `UPDATE email_outbox
        SET status = 'sending', attempts = attempts + 1, next_attempt_at = now() + make_interval(mins => $2::int)
      WHERE id IN (SELECT id FROM email_outbox
                    WHERE status = 'pending' AND next_attempt_at <= now()
                    ORDER BY next_attempt_at
                    LIMIT $1
                    FOR UPDATE SKIP LOCKED)
      RETURNING id, recipient_email AS "recipientEmail", subject, body_text AS "bodyText", body_html AS "bodyHtml", attempts`,
    [limit, leaseMinutes],
  );
  return result.rows;
}

export async function markEmailSent(id: string, db: Queryable = pool): Promise<void> {
  await db.query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`, [id]);
}

// ส่งไม่สำเร็จ: ลองใหม่หลัง retryInSeconds หรือเลิก (failed) เมื่อ retryInSeconds = null
export async function markEmailFailed(id: string, error: string, retryInSeconds: number | null, db: Queryable = pool): Promise<void> {
  await db.query(
    `UPDATE email_outbox
        SET status = CASE WHEN $3::int IS NULL THEN 'failed' ELSE 'pending' END,
            next_attempt_at = CASE WHEN $3::int IS NULL THEN next_attempt_at ELSE now() + make_interval(secs => $3::int) END,
            last_error = $2
      WHERE id = $1`,
    [id, error.slice(0, 500), retryInSeconds],
  );
}

// worker ล่มระหว่างส่ง: แถวที่ค้าง sending จนพ้นสัญญาเช่ากลับไปรอส่งใหม่
// (ใช้ next_attempt_at ไม่ใช้ updated_at เพราะ trigger เขียนทับ updated_at ทุกครั้งที่ UPDATE)
export async function releaseExpiredLeases(db: Queryable = pool): Promise<number> {
  const result = await db.query(`UPDATE email_outbox SET status = 'pending' WHERE status = 'sending' AND next_attempt_at < now()`);
  return result.rowCount ?? 0;
}

// อีเมลที่รอส่งนานเกินกำหนด (เช่น ปิดสวิตช์ไว้) → skipped ไม่ส่งข่าวเก่าออกไปภายหลัง
export async function skipStaleEmails(olderThanHours: number, db: Queryable = pool): Promise<number> {
  const result = await db.query(
    `UPDATE email_outbox SET status = 'skipped', last_error = 'รอส่งนานเกินกำหนด จึงยกเลิก'
      WHERE status = 'pending' AND created_at < now() - make_interval(hours => $1::int)`,
    [olderThanHours],
  );
  return result.rowCount ?? 0;
}

// PDPA: ลบประวัติที่ปิดงานแล้วเมื่อเกินระยะเก็บ
export async function purgeOldEmails(olderThanDays: number, db: Queryable = pool): Promise<number> {
  const result = await db.query(
    `DELETE FROM email_outbox
      WHERE status IN ('sent', 'failed', 'skipped') AND created_at < now() - make_interval(days => $1::int)`,
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}

export interface OutboxListItem {
  id: string;
  kind: string;
  recipientEmail: string;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export async function listRecentEmails(limit: number, db: Queryable = pool): Promise<OutboxListItem[]> {
  const result = await db.query<OutboxListItem>(
    `SELECT id, kind, recipient_email AS "recipientEmail", subject, status, attempts, last_error AS "lastError",
            created_at AS "createdAt", sent_at AS "sentAt"
       FROM email_outbox ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}

// จำนวนตามสถานะ: รอส่ง/ล้มเหลวทั้งหมด และส่งสำเร็จใน 7 วันล่าสุด
export async function countEmailsByStatus(db: Queryable = pool): Promise<{ pending: number; failed: number; sent7d: number }> {
  const result = await db.query<{ pending: number; failed: number; sent7d: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('pending', 'sending'))::int AS pending,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status = 'sent' AND sent_at > now() - interval '7 days')::int AS "sent7d"
       FROM email_outbox`,
  );
  return result.rows[0]!;
}
