-- Up Migration
-- permission ระบบ: รับทราบรายงานประจำปีของทุกชมรม และดูภาพรวมการส่งรายงาน
-- ผู้ใช้ยืนยันให้ผูกกับ role club_officer (เจ้าหน้าที่สโมสร)
INSERT INTO permissions (code, description_th)
VALUES ('club_report:review', 'รับทราบรายงานประจำปีของทุกชมรม และดูภาพรวมการส่งรายงาน')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code = 'club_report:review'
 WHERE r.code = 'club_officer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'club_report:review');
DELETE FROM permissions WHERE code = 'club_report:review';
