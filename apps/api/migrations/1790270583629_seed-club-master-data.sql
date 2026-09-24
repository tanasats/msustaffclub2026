-- Up Migration
-- ข้อมูลตั้งต้นของชมรม (ยืนยันแล้วใน docs/design/club-establishment.md หัวข้อ 3)
-- ON CONFLICT DO NOTHING: รันซ้ำได้ และไม่ทับค่าที่ผู้ดูแลปรับภายหลัง

INSERT INTO club_categories (code, name_th, requires_detail, sort_order)
VALUES
  ('academic',       'ด้านวิชาการ',                                   false, 1),
  ('ethics_culture', 'ด้านคุณธรรมและจริยธรรม และศิลปวัฒนธรรม',       false, 2),
  ('volunteer',      'ด้านบำเพ็ญประโยชน์',                           false, 3),
  ('health_sports',  'ด้านสุขภาพ กีฬาและนันทนาการ',                   false, 4),
  ('other',          'ด้านอื่น ๆ ที่คณะกรรมการเห็นสมควร',              true,  5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO club_positions (code, name_th, kind, max_per_club, sort_order)
VALUES
  ('president',           'ประธานชมรม',       'committee', 1,    1),
  ('vice_president',      'รองประธานชมรม',    'committee', NULL, 2),
  ('secretary',           'เลขานุการ',        'committee', NULL, 3),
  ('assistant_secretary', 'ผู้ช่วยเลขานุการ',  'committee', NULL, 4),
  ('treasurer',           'เหรัญญิก',         'committee', NULL, 5),
  ('assistant_treasurer', 'ผู้ช่วยเหรัญญิก',   'committee', NULL, 6),
  ('public_relations',    'ประชาสัมพันธ์',     'committee', NULL, 7),
  ('committee_member',    'กรรมการ',          'committee', NULL, 8),
  ('advisor',             'ที่ปรึกษาชมรม',     'advisor',   2,    9),
  ('member',              'สมาชิก',           'member',    NULL, 10)
ON CONFLICT (code) DO NOTHING;

INSERT INTO club_permissions (code, description_th)
VALUES
  ('club:view_internal',       'ดูข้อมูลภายในชมรม (รายชื่อสมาชิกพร้อมข้อมูลติดต่อ, รายงาน, คำขอ)'),
  ('club_profile:edit',        'แก้ไขข้อมูลชมรม: ประวัติ, คำขวัญ, ตรา, วัตถุประสงค์, ที่ทำการ, ระเบียบ'),
  ('club_member:approve',      'อนุมัติ/ปฏิเสธผู้สมัคร และให้สมาชิกพ้นสภาพ'),
  ('club_committee:manage',    'แต่งตั้ง/สิ้นสุดตำแหน่งกรรมการ'),
  ('club_activity:manage',     'จัดการแผนกิจกรรมและบันทึกกิจกรรม'),
  ('club_achievement:manage',  'บันทึก/แก้ไขผลงานชมรม'),
  ('club_report:submit',       'ส่งรายงานรายเดือน/ประจำปี และยื่นต่อทะเบียน'),
  ('club_finance:manage',      'จัดการงบประมาณชมรม'),
  ('club_report:acknowledge',  'รับทราบรายงานรายเดือนของชมรม (ที่ปรึกษา)')
ON CONFLICT (code) DO NOTHING;

-- ตาราง ตำแหน่ง ↔ สิทธิ์ (หัวข้อ 3.3) เขียนเป็นคู่ (ตำแหน่ง, สิทธิ์) แล้ว JOIN หา id
INSERT INTO club_position_permissions (position_id, club_permission_id)
SELECT p.id, cp.id
  FROM (VALUES
    -- ประธาน: ทุกสิทธิ์ยกเว้นรับทราบรายงาน
    ('president', 'club:view_internal'), ('president', 'club_profile:edit'), ('president', 'club_member:approve'),
    ('president', 'club_committee:manage'), ('president', 'club_activity:manage'), ('president', 'club_achievement:manage'),
    ('president', 'club_report:submit'), ('president', 'club_finance:manage'),
    -- รองประธาน
    ('vice_president', 'club:view_internal'), ('vice_president', 'club_profile:edit'), ('vice_president', 'club_member:approve'),
    ('vice_president', 'club_activity:manage'), ('vice_president', 'club_achievement:manage'),
    -- เลขานุการ
    ('secretary', 'club:view_internal'), ('secretary', 'club_profile:edit'), ('secretary', 'club_member:approve'),
    ('secretary', 'club_activity:manage'), ('secretary', 'club_achievement:manage'), ('secretary', 'club_report:submit'),
    -- เหรัญญิก
    ('treasurer', 'club:view_internal'), ('treasurer', 'club_activity:manage'), ('treasurer', 'club_achievement:manage'),
    ('treasurer', 'club_finance:manage'),
    -- ประชาสัมพันธ์
    ('public_relations', 'club:view_internal'), ('public_relations', 'club_profile:edit'),
    ('public_relations', 'club_activity:manage'), ('public_relations', 'club_achievement:manage'),
    -- ผู้ช่วย / กรรมการอื่น
    ('assistant_secretary', 'club:view_internal'), ('assistant_secretary', 'club_activity:manage'), ('assistant_secretary', 'club_achievement:manage'),
    ('assistant_treasurer', 'club:view_internal'), ('assistant_treasurer', 'club_activity:manage'), ('assistant_treasurer', 'club_achievement:manage'),
    ('committee_member', 'club:view_internal'), ('committee_member', 'club_activity:manage'), ('committee_member', 'club_achievement:manage'),
    -- ที่ปรึกษา
    ('advisor', 'club:view_internal'), ('advisor', 'club_report:acknowledge')
    -- สมาชิก: ไม่มีสิทธิ์ชมรม (ดูหน้าชมรม/ลาออกได้โดยไม่ต้องใช้สิทธิ์)
  ) AS m (position_code, permission_code)
  JOIN club_positions p ON p.code = m.position_code
  JOIN club_permissions cp ON cp.code = m.permission_code
ON CONFLICT (position_id, club_permission_id) DO NOTHING;

-- Down Migration
DELETE FROM club_position_permissions;
DELETE FROM club_permissions WHERE code IN (
  'club:view_internal', 'club_profile:edit', 'club_member:approve', 'club_committee:manage', 'club_activity:manage',
  'club_achievement:manage', 'club_report:submit', 'club_finance:manage', 'club_report:acknowledge'
);
DELETE FROM club_positions WHERE code IN (
  'president', 'vice_president', 'secretary', 'assistant_secretary', 'treasurer', 'assistant_treasurer',
  'public_relations', 'committee_member', 'advisor', 'member'
);
DELETE FROM club_categories WHERE code IN ('academic', 'ethics_culture', 'volunteer', 'health_sports', 'other');
