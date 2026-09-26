-- Up Migration
-- permission ระบบ: เปิดรอบคัดเลือกตัวแทน/พิจารณารางวัล และบันทึกผลการตัดสิน (ระยะที่ 5 ขั้น 5.3)
-- ยังไม่ผูกกับ role ใด (รอผู้ใช้กำหนด) → ใช้ได้เฉพาะ super_admin ตามหลักค่าเริ่มต้นคือปฏิเสธ
INSERT INTO permissions (code, description_th)
VALUES ('sport_selection:manage', 'เปิดรอบคัดเลือกตัวแทน/พิจารณารางวัลนักกีฬา และบันทึกผลการตัดสิน')
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'sport_selection:manage');
DELETE FROM permissions WHERE code = 'sport_selection:manage';
