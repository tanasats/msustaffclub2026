-- Up Migration
-- permission ระบบ: ปิด/เปิดบัญชีผู้ใช้ที่พ้นจากมหาวิทยาลัย (ปิดแล้วพ้นสภาพสมาชิก/กรรมการ/ที่ปรึกษาในทุกชมรม)
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้วว่าเฉพาะ super_admin) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('user_account:deactivate', 'ปิด/เปิดบัญชีผู้ใช้ที่พ้นจากมหาวิทยาลัย และให้พ้นสภาพในทุกชมรม')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'user_account:deactivate');
DELETE FROM permissions WHERE code = 'user_account:deactivate';
