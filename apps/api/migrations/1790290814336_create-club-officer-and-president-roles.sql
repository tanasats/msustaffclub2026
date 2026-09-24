-- Up Migration
-- role ขององค์กร (ผู้ใช้กำหนด): เจ้าหน้าที่สโมสร = ตรวจคำขอขั้นที่ 1, นายกสโมสร = อนุมัติขั้นที่ 2
-- is_system = false (role ขององค์กร ไม่ใช่ของระบบ)
-- is_privileged = true: ให้/ถอนได้เฉพาะ super_admin เพราะเป็นสิทธิ์อนุมัติ (ค่าที่ปลอดภัยไว้ก่อน)
INSERT INTO roles (code, name_th, description, is_system, is_privileged)
VALUES
  ('club_officer',   'เจ้าหน้าที่สโมสร', 'ตรวจคำขอจัดตั้ง/ต่อทะเบียนชมรม (ขั้นที่ 1)', false, true),
  ('club_president', 'นายกสโมสร',       'อนุมัติคำขอจัดตั้ง/ต่อทะเบียนชมรม (ขั้นที่ 2)', false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
    ('club_officer',   'club_application:review'),
    ('club_president', 'club_application:approve')
  ) AS m (role_code, permission_code)
  JOIN roles r ON r.code = m.role_code
  JOIN permissions p ON p.code = m.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Down Migration
-- ถ้ามีผู้ใช้ถือ role อยู่แล้ว FK ของ user_roles/role_change_logs จะปฏิเสธการลบ (ถูกต้องแล้ว ต้องถอนก่อน)
DELETE FROM roles WHERE code IN ('club_officer', 'club_president');
