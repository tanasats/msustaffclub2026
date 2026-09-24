import { pool, type Queryable } from '../db/pool.js';

export type ClubStatus = 'active' | 'suspended' | 'dissolved';

export interface ClubAccessRow {
  clubStatus: ClubStatus;
  // union ของสิทธิ์จากทุกตำแหน่งที่ผู้ใช้ถืออยู่ในชมรมนี้
  permissions: string[];
}

/**
 * อ่านสถานะชมรม + สิทธิ์ระดับชมรมของผู้ใช้ใน query เดียว (คืน null ถ้าไม่พบชมรมหรือถูกลบ)
 * ตำแหน่งที่ "ถืออยู่" มาจาก 3 แหล่ง รวมด้วย UNION ALL:
 *   - กรรมการที่ยังไม่สิ้นสุด (ended_on IS NULL)
 *   - ที่ปรึกษาที่ยังไม่สิ้นสุด → ตำแหน่ง kind = 'advisor'
 *   - สมาชิกที่ status = 'active' → ตำแหน่ง kind = 'member'
 * แล้ว JOIN ตำแหน่ง → สิทธิ์ และรวมเป็น array (DISTINCT ตัดซ้ำ)
 * ใช้ partial index ของแต่ละตาราง (club_committee_members_current_idx, club_advisors_current_key, club_memberships_current_key)
 */
export async function findClubAccess(clubId: string, userId: string, db: Queryable = pool): Promise<ClubAccessRow | null> {
  const result = await db.query<ClubAccessRow>(
    `SELECT c.status AS "clubStatus",
            ARRAY(
              SELECT DISTINCT cp.code
                FROM (
                  SELECT cm.position_id
                    FROM club_committee_members cm
                   WHERE cm.club_id = c.id AND cm.user_id = $2 AND cm.ended_on IS NULL
                  UNION ALL
                  SELECT p.id
                    FROM club_advisors a
                    JOIN club_positions p ON p.kind = 'advisor'
                   WHERE a.club_id = c.id AND a.user_id = $2 AND a.ended_on IS NULL
                  UNION ALL
                  SELECT p.id
                    FROM club_memberships m
                    JOIN club_positions p ON p.kind = 'member'
                   WHERE m.club_id = c.id AND m.user_id = $2 AND m.status = 'active'
                ) AS held
                JOIN club_position_permissions cpp ON cpp.position_id = held.position_id
                JOIN club_permissions cp ON cp.id = cpp.club_permission_id
               ORDER BY cp.code
            ) AS permissions
       FROM clubs c
      WHERE c.id = $1
        AND c.deleted_at IS NULL`,
    [clubId, userId],
  );
  return result.rows[0] ?? null;
}
