-- Up Migration
-- permission ระบบ: ดูข้อมูลบัญชีผู้ใช้แบบเต็ม (Google, ERP, การเข้าระบบ และข้อมูลทั้งหมดแบบหน้าข้อมูลของฉัน)
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้ว) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('user_account:inspect', 'ดูข้อมูลบัญชีผู้ใช้แบบเต็ม (Google, ERP, การเข้าระบบ และข้อมูลทั้งหมดแบบหน้าข้อมูลของฉัน)')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'user_account:inspect');
DELETE FROM permissions WHERE code = 'user_account:inspect';
