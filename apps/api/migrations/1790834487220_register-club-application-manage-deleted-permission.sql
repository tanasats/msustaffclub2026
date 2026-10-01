-- Up Migration
-- permission ระบบ: ดูคำขอที่ผู้ยื่นลบออกจากรายการแล้ว และกู้คืนคำขอที่ยกเลิก/ลบแล้วเป็นฉบับร่าง
-- ไม่ผูกกับ role ใด (ผู้ใช้ยืนยันแล้ว) → ใช้ได้เฉพาะ super_admin
INSERT INTO permissions (code, description_th)
VALUES ('club_application:manage_deleted', 'ดูคำขอที่ผู้ยื่นลบแล้ว และกู้คืนคำขอที่ยกเลิก/ลบแล้วเป็นฉบับร่าง')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'club_application:manage_deleted');
DELETE FROM permissions WHERE code = 'club_application:manage_deleted';
