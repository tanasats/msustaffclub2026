-- Up Migration
-- permission ระบบ: ดูรายชื่อสมาชิก/ใบสมัครที่กรรมการลบแล้ว และกู้คืน
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้ว) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('club_membership:manage_deleted', 'ดูรายชื่อสมาชิก/ใบสมัครที่กรรมการลบแล้ว และกู้คืน')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'club_membership:manage_deleted');
DELETE FROM permissions WHERE code = 'club_membership:manage_deleted';
