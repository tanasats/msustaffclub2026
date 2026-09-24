-- Up Migration
-- role ที่ระบบให้อัตโนมัติตอน login ตามประเภทบัญชี (ส่วนหน้า @ เป็นตัวเลข 11 หลัก = นิสิต, อื่น ๆ = บุคลากร)
-- is_system = true เพราะโค้ดอ้างถึง code ของ role เหล่านี้ (ห้ามลบ/เปลี่ยน code)
-- ยังไม่ผูก permission ใด (ให้ผู้ใช้/super_admin กำหนดภายหลัง)
INSERT INTO roles (code, name_th, description, is_system, is_privileged)
VALUES
  ('student', 'นิสิต', 'ได้รับอัตโนมัติเมื่อเข้าสู่ระบบด้วยบัญชีรหัสนิสิต', true, false),
  ('staff', 'บุคลากร', 'ได้รับอัตโนมัติเมื่อเข้าสู่ระบบด้วยบัญชีบุคลากร', true, false)
ON CONFLICT (code) DO NOTHING;

-- Down Migration
SET LOCAL app.allow_system_role_change = 'on';
DELETE FROM roles WHERE code IN ('student', 'staff');
