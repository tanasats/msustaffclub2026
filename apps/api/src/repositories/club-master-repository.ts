import { pool, type Queryable } from '../db/pool.js';

export interface ClubCategoryRecord {
  id: string;
  code: string;
  nameTh: string;
  requiresDetail: boolean;
}

export async function listActiveClubCategories(db: Queryable = pool): Promise<ClubCategoryRecord[]> {
  // ข้อมูลหลักมีไม่กี่แถว LIMIT กันไว้ตามมาตรฐาน
  const result = await db.query<ClubCategoryRecord>(
    `SELECT id, code, name_th AS "nameTh", requires_detail AS "requiresDetail"
       FROM club_categories
      WHERE is_active
      ORDER BY sort_order, code
      LIMIT 100`,
  );
  return result.rows;
}

export async function findClubCategoryById(id: string, db: Queryable = pool): Promise<ClubCategoryRecord | null> {
  const result = await db.query<ClubCategoryRecord>(
    `SELECT id, code, name_th AS "nameTh", requires_detail AS "requiresDetail"
       FROM club_categories
      WHERE id = $1 AND is_active`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface ClubPositionRecord {
  id: string;
  code: string;
  nameTh: string;
  kind: 'committee' | 'advisor' | 'member';
  maxPerClub: number | null;
}

export async function listClubPositions(db: Queryable = pool): Promise<ClubPositionRecord[]> {
  const result = await db.query<ClubPositionRecord>(
    `SELECT id, code, name_th AS "nameTh", kind, max_per_club AS "maxPerClub"
       FROM club_positions
      ORDER BY sort_order, code
      LIMIT 100`,
  );
  return result.rows;
}

// แม่แบบระเบียบฉบับล่าสุดที่เปิดใช้งาน
export async function findActiveRegulationTemplate(db: Queryable = pool): Promise<string | null> {
  const result = await db.query<{ body: string }>(
    `SELECT body
       FROM club_regulation_templates
      WHERE is_active
      ORDER BY version DESC
      LIMIT 1`,
  );
  return result.rows[0]?.body ?? null;
}
