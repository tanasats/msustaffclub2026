-- Up Migration
-- role ขององค์กร (ผู้ใช้กำหนด): คณะกรรมการคัดเลือก = คัดเลือกตัวแทนนักกีฬา/พิจารณารางวัล (sport_selection:manage)
-- is_system = false (role ขององค์กร), is_privileged = true: ให้/ถอนได้เฉพาะ super_admin (เหมือนเจ้าหน้าที่สโมสร/นายกสโมสร)
-- ยังไม่มีผู้ถือ role — super_admin มอบให้ผู้ใช้ภายหลังผ่านหน้าจัดการสิทธิ์
INSERT INTO roles (code, name_th, description, is_system, is_privileged)
VALUES ('sport_selection_committee', 'คณะกรรมการคัดเลือก', 'คัดเลือกตัวแทนนักกีฬาและพิจารณารางวัลเชิดชูเกียรติ', false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code = 'sport_selection:manage'
 WHERE r.code = 'sport_selection_committee'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Down Migration
-- ถ้ามีผู้ใช้ถือ role อยู่แล้ว FK ของ user_roles/role_change_logs จะปฏิเสธการลบ (ถูกต้องแล้ว ต้องถอนก่อน)
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = 'sport_selection_committee');
DELETE FROM roles WHERE code = 'sport_selection_committee';
