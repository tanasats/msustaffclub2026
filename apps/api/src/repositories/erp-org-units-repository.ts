import { pool, type Queryable } from '../db/pool.js';

/**
 * บันทึกหน่วยงานจาก ERP แล้วคืน org_unit_id ที่จับคู่ไว้ (null = ยังจับคู่ไม่ได้)
 * - รหัส ERP ใหม่: INSERT พร้อมลองจับคู่จากชื่อที่ตรงกับ org_units (ตัดช่องว่างเกินทั้งสองฝั่ง)
 * - รหัสเดิม: อัปเดตชื่อล่าสุด แต่คงการจับคู่เดิมไว้ (COALESCE เอาค่าเดิมก่อน)
 *   ถ้าเดิมยังไม่จับคู่ และตอนนี้ชื่อตรงแล้ว จะเติมให้
 * scalar subquery + LIMIT 1 กันกรณีมีชื่อซ้ำใน org_units (ได้ค่าเดียวเสมอ)
 * ต้องส่ง name ที่ normalize แล้ว (ดู normalizeUnitName)
 */
export async function upsertErpOrgUnit(erpId: string, name: string, db: Queryable = pool): Promise<string | null> {
  const result = await db.query<{ orgUnitId: string | null }>(
    `INSERT INTO erp_org_units (erp_id, name_th, org_unit_id, match_source)
     SELECT $1, $2, matched.id, CASE WHEN matched.id IS NULL THEN NULL ELSE 'name' END
       FROM (
         SELECT (
           SELECT ou.id
             FROM org_units ou
            WHERE ou.is_active
              AND btrim(regexp_replace(ou.name_th, '\\s+', ' ', 'g')) = $2
            ORDER BY ou.code
            LIMIT 1
         ) AS id
       ) AS matched
     ON CONFLICT (erp_id) DO UPDATE
        SET name_th      = EXCLUDED.name_th,
            org_unit_id  = COALESCE(erp_org_units.org_unit_id, EXCLUDED.org_unit_id),
            match_source = COALESCE(erp_org_units.match_source, EXCLUDED.match_source)
     RETURNING org_unit_id AS "orgUnitId"`,
    [erpId, name],
  );
  return result.rows[0]?.orgUnitId ?? null;
}
