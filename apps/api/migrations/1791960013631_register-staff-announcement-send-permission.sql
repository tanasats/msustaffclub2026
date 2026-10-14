-- Up Migration
-- permission ระบบ: ส่งประกาศถึงบุคลากร (ทุกคน / กรรมการชมรม / สมาชิกชมรม / ตามหน่วยงาน)
-- ผูกกับ club_officer และ club_president (ผู้ใช้ยืนยันแล้ว) — super_admin ผ่านทุก permission อยู่แล้ว
INSERT INTO permissions (code, description_th)
VALUES ('staff_announcement:send', 'ส่งประกาศจากสโมสรบุคลากรถึงบุคลากร (ทุกคน / กรรมการชมรม / สมาชิกชมรม / ตามหน่วยงาน)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'staff_announcement:send'
 WHERE r.code IN ('club_officer', 'club_president')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'staff_announcement:send');
DELETE FROM permissions WHERE code = 'staff_announcement:send';
