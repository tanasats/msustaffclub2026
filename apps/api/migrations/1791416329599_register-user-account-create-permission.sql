-- Up Migration
-- permission ระบบ: เพิ่มผู้ใช้ล่วงหน้าสำหรับบุคลากรที่ยังไม่เคยเข้าระบบ และแก้ข้อมูลบัญชีที่ยังไม่ผูก
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้ว) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('user_account:create', 'เพิ่มผู้ใช้ล่วงหน้าสำหรับบุคลากรที่ยังไม่เคยเข้าระบบ และแก้ข้อมูลบัญชีที่ยังไม่ผูก')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'user_account:create');
DELETE FROM permissions WHERE code = 'user_account:create';
