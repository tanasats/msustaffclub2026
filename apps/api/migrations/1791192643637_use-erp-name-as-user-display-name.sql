-- Up Migration
-- ชื่อที่แสดงในระบบ (users.name) ใช้ชื่อตาม ERP-HR ซึ่งเป็นฐานข้อมูลหลัก แทนชื่อจากบัญชี Google ที่ผู้ใช้แก้เองได้
-- google_name เก็บชื่อจาก Google ไว้ตรวจสอบเมื่อชื่อไม่ตรง (และใช้คืนค่าตอน down) — ผู้ใช้อนุญาตให้แก้ข้อมูลเดิมแล้ว
ALTER TABLE users ADD COLUMN google_name text;

UPDATE users SET google_name = name;

-- บุคลากรที่มีชื่อ-นามสกุลจาก ERP ครบ → ชื่อแสดง = "ชื่อ นามสกุล" ภาษาไทย (ไม่มีคำนำหน้า)
-- UPDATE ... FROM จับคู่กับ staff_profiles ทีละคนในคำสั่งเดียว, เงื่อนไขไม่ว่างกันชื่อหายเมื่อ ERP ส่งค่าว่าง
UPDATE users u
   SET name = btrim(sp.first_name_th) || ' ' || btrim(sp.last_name_th)
  FROM staff_profiles sp
 WHERE sp.user_id = u.id
   AND btrim(coalesce(sp.first_name_th, '')) <> ''
   AND btrim(coalesce(sp.last_name_th, '')) <> '';

-- Down Migration
UPDATE users SET name = google_name WHERE google_name IS NOT NULL;
ALTER TABLE users DROP COLUMN google_name;
