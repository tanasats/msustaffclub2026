-- Up Migration
-- ข้อมูลตั้งต้น: ON CONFLICT DO NOTHING ทำให้รันซ้ำได้โดยไม่ error และไม่สร้างซ้ำ
INSERT INTO roles (code, name_th, description, is_system, is_privileged)
VALUES
  ('user', 'ผู้ใช้งานทั่วไป', 'ทุกคนได้รับเมื่อเข้าสู่ระบบครั้งแรก ถอนไม่ได้', true, false),
  ('super_admin', 'ผู้ดูแลระบบสูงสุด', 'ผ่านทุก permission ให้/ถอนได้เฉพาะ super_admin', true, true)
ON CONFLICT (code) DO NOTHING;

-- permission ที่กฎการให้/ถอน role อ้างถึง (ยังไม่ผูกกับ role ใด → ใช้ได้เฉพาะ super_admin)
INSERT INTO permissions (code, description_th)
VALUES
  ('user_role:assign', 'ให้/ถอน role ที่ไม่ใช่ role สิทธิ์สูง (is_privileged = false) แก่ผู้ใช้อื่น')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM permissions WHERE code = 'user_role:assign';
-- อนุญาตให้ลบ role ระบบเฉพาะใน transaction นี้ (ถ้ายังมีผู้ใช้ถือ role อยู่ FK จะปฏิเสธ ซึ่งถูกต้องแล้ว)
SET LOCAL app.allow_system_role_change = 'on';
DELETE FROM roles WHERE code IN ('user', 'super_admin');
