-- Up Migration
-- เปลี่ยนชื่อ role ที่กำหนดผิด: เจ้าหน้าที่สโมสร (club_officer) → กรรมการสโมสร (club_committee) — ผู้ใช้ยืนยันแล้ว
-- แก้แถวเดิม (ไม่สร้างใหม่) ผู้ถือ role การผูกสิทธิ์ และประวัติทั้งหมดอ้างด้วย role_id จึงติดไปด้วย
-- role นี้ไม่ใช่ role ระบบ (is_system = false) trigger roles_protect_system จึงอนุญาตให้เปลี่ยน code
UPDATE roles
   SET code = 'club_committee',
       name_th = 'กรรมการสโมสร'
 WHERE code = 'club_officer';

-- Down Migration
UPDATE roles
   SET code = 'club_officer',
       name_th = 'เจ้าหน้าที่สโมสร'
 WHERE code = 'club_committee';
