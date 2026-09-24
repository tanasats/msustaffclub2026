-- Up Migration
-- permission ระบบสำหรับงานชมรม (ยืนยันแล้วใน docs/design/club-establishment.md หัวข้อ 2)
INSERT INTO permissions (code, description_th)
VALUES
  ('club_application:create',  'ยื่นคำขอจัดตั้ง/ต่อทะเบียนชมรม'),
  ('club_application:review',  'ตรวจคำขอขั้นที่ 1: ตรวจผ่าน หรือส่งกลับแก้ไข'),
  ('club_application:approve', 'อนุมัติขั้นที่ 2: อนุมัติ / ไม่อนุมัติ / ส่งกลับแก้ไข'),
  ('club:read_all',            'ดูข้อมูลทุกชมรมและทุกคำขอ (อ่านอย่างเดียว)'),
  ('club:manage_all',          'จัดการทุกชมรมและข้อมูลหลักของชมรม และผ่านสิทธิ์ระดับชมรมทุกข้อ')
ON CONFLICT (code) DO NOTHING;

-- ผู้ใช้ยืนยันให้ผูก club_application:create กับ role staff (บุคลากรยื่นคำขอได้)
-- permission อื่นยังไม่ผูก → ใช้ได้เฉพาะ super_admin จนกว่าจะกำหนด role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.code = 'staff' AND p.code = 'club_application:create'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Down Migration
DELETE FROM permissions WHERE code IN (
  'club_application:create', 'club_application:review', 'club_application:approve', 'club:read_all', 'club:manage_all'
);
