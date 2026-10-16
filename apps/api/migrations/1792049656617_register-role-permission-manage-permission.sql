-- Up Migration
-- permission ระบบ: ดูสิทธิ์ทั้งหมดในระบบ แก้การผูก role ↔ สิทธิ์ และสิทธิ์ตามตำแหน่งในชมรม สร้าง/แก้ role
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้ว) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('role_permission:manage', 'ดูสิทธิ์ทั้งหมดในระบบ แก้การผูก role กับสิทธิ์ และสิทธิ์ตามตำแหน่งในชมรม และสร้าง/แก้ role')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'role_permission:manage');
DELETE FROM permissions WHERE code = 'role_permission:manage';
