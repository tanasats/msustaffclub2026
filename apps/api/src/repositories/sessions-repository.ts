import { pool, type Queryable } from '../db/pool.js';

export interface NewSession {
  tokenHash: Buffer;
  userId: string;
  ttlDays: number;
}

export async function insertSession(input: NewSession, db: Queryable = pool): Promise<{ id: string; expiresAt: Date }> {
  // คำนวณวันหมดอายุในฐานข้อมูลด้วย now() ให้เวลาอ้างอิงเดียวกับตอนตรวจ (expires_at > now())
  const result = await db.query<{ id: string; expiresAt: Date }>(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))
     RETURNING id, expires_at AS "expiresAt"`,
    [input.tokenHash, input.userId, input.ttlDays],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('สร้าง session ไม่สำเร็จ');
  }
  return row;
}

// ล้าง session ที่หมดอายุแล้วของผู้ใช้คนนี้ (ทำตอน login เพื่อไม่ให้ตารางโตไม่หยุด) ใช้ index sessions_user_id_idx
export async function deleteExpiredSessionsForUser(userId: string, db: Queryable = pool): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [userId]);
}

export interface SessionWithUser {
  sessionId: string;
  lastSeenAt: Date;
  userId: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  roles: string[];
  permissions: string[];
}

/**
 * อ่าน session + ผู้ใช้ + role + permission ใน query เดียว (เรียกทุก request ที่มี cookie)
 * - WHERE ตัด session หมดอายุและผู้ใช้ที่ถูกปิดใช้งานทิ้ง → ปิดบัญชีแล้วใช้งานไม่ได้ทันที
 * - ARRAY(subquery) รวม code ของ role และ permission เป็น array ในแถวเดียว
 * - permission = union จากทุก role ที่ถืออยู่ (DISTINCT ตัดตัวซ้ำ)
 * ใช้ index sessions_token_hash_key และ PK ของ user_roles
 */
export async function findActiveSessionWithUser(tokenHash: Buffer, db: Queryable = pool): Promise<SessionWithUser | null> {
  const result = await db.query<SessionWithUser>(
    `SELECT s.id           AS "sessionId",
            s.last_seen_at AS "lastSeenAt",
            u.id           AS "userId",
            u.email,
            u.name,
            u.picture_url  AS "pictureUrl",
            ARRAY(
              SELECT r.code
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id
               ORDER BY r.code
            ) AS roles,
            ARRAY(
              SELECT DISTINCT p.code
                FROM user_roles ur
                JOIN role_permissions rp ON rp.role_id = ur.role_id
                JOIN permissions p ON p.id = rp.permission_id
               WHERE ur.user_id = u.id
               ORDER BY p.code
            ) AS permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.is_active`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

/**
 * อัปเดต last_seen_at ไม่เกิน 1 ครั้งต่อ 5 นาที (ลดการเขียนฐานข้อมูลทุก request)
 * เงื่อนไขอยู่ใน WHERE จึงไม่ต้องอ่านค่าก่อน
 */
export async function touchSession(sessionId: string, db: Queryable = pool): Promise<void> {
  await db.query(
    `UPDATE sessions
        SET last_seen_at = now()
      WHERE id = $1
        AND last_seen_at < now() - interval '5 minutes'`,
    [sessionId],
  );
}

export async function deleteSessionByTokenHash(tokenHash: Buffer, db: Queryable = pool): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}
