-- Up Migration
-- ระยะที่ 5 (ยืนยันแล้ว):
-- - permission ระบบ sport:manage (จัดการรายการชนิดกีฬา) ผูกกับ club_officer ("เจ้าหน้าที่เพิ่มได้")
-- - สิทธิ์ชมรม club_sport:manage (เลือกชนิดกีฬาของชมรม, จัดการนักกีฬา) ผูกกับประธาน รองประธาน เลขาฯ และตำแหน่งใหม่ผู้จัดการทีม/โค้ช
INSERT INTO permissions (code, description_th)
VALUES ('sport:manage', 'เพิ่ม/แก้ไข/ปิดใช้งานรายการชนิดกีฬา')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'sport:manage' WHERE r.code = 'club_officer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO club_permissions (code, description_th)
VALUES ('club_sport:manage', 'เลือกชนิดกีฬาของชมรม และจัดการรายชื่อนักกีฬา')
ON CONFLICT (code) DO NOTHING;

INSERT INTO club_positions (code, name_th, kind, max_per_club, sort_order)
VALUES ('team_manager', 'ผู้จัดการทีม/โค้ช', 'committee', NULL, 9)
ON CONFLICT (code) DO NOTHING;

INSERT INTO club_position_permissions (position_id, club_permission_id)
SELECT p.id, cp.id
  FROM (VALUES
    ('president', 'club_sport:manage'),
    ('vice_president', 'club_sport:manage'),
    ('secretary', 'club_sport:manage'),
    ('team_manager', 'club_sport:manage'),
    ('team_manager', 'club:view_internal'),
    ('team_manager', 'club_activity:manage')
  ) AS m (position_code, permission_code)
  JOIN club_positions p ON p.code = m.position_code
  JOIN club_permissions cp ON cp.code = m.permission_code
ON CONFLICT (position_id, club_permission_id) DO NOTHING;

-- Down Migration
-- ถ้ามีผู้ดำรงตำแหน่งผู้จัดการทีมอยู่ FK จะปฏิเสธการลบตำแหน่ง (ถูกต้องแล้ว ต้องให้พ้นตำแหน่งก่อน)
DELETE FROM club_position_permissions
 WHERE position_id IN (SELECT id FROM club_positions WHERE code = 'team_manager')
    OR club_permission_id IN (SELECT id FROM club_permissions WHERE code = 'club_sport:manage');
DELETE FROM club_positions WHERE code = 'team_manager';
DELETE FROM club_permissions WHERE code = 'club_sport:manage';
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'sport:manage');
DELETE FROM permissions WHERE code = 'sport:manage';
