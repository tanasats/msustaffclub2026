-- Up Migration
-- ชื่อแบบทางการสำหรับเอกสารพิมพ์ = คำนำหน้าจาก ERP (เช่น นาย/นางสาว/ดร.) ต่อด้วยชื่อแสดง โดยไม่เว้นวรรค ตามแบบหนังสือราชการ
-- ไม่มีคำนำหน้า (นิสิต/ERP ไม่มีข้อมูล) → ชื่อแสดง, ไม่มีชื่อ → อีเมล
-- STABLE: ผลลัพธ์ไม่เปลี่ยนภายในคำสั่งเดียว ใช้ใน SELECT ของเอกสารได้ (เอกสารมีไม่กี่ร้อยชื่อ)
CREATE FUNCTION user_formal_name(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(btrim(sp.prefix_name_th), '') || coalesce(u.name, u.email)
    FROM users u
    LEFT JOIN staff_profiles sp ON sp.user_id = u.id
   WHERE u.id = p_user_id
$$;

-- Down Migration
DROP FUNCTION IF EXISTS user_formal_name(uuid);
