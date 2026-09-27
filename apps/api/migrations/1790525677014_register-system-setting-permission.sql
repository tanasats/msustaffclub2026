-- Up Migration
-- permission ระบบ: ตั้งค่าระบบ รวมถึงเปิด/ปิดการส่งอีเมลแจ้งเตือน
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้ว) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('system_setting:manage', 'ตั้งค่าระบบ รวมถึงเปิด/ปิดการส่งอีเมลแจ้งเตือน')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'system_setting:manage');
DELETE FROM permissions WHERE code = 'system_setting:manage';
