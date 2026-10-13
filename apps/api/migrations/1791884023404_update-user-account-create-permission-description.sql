-- Up Migration
-- user_account:create ใช้บันทึกข้อมูลบุคลากรแทน ERP ด้วย (บัญชีบุคลากรที่ ERP ไม่มีข้อมูล เช่น ERP ไม่ได้บันทึกอีเมล)
UPDATE permissions
   SET description_th = 'เพิ่มผู้ใช้ล่วงหน้าสำหรับบุคลากรที่ยังไม่เคยเข้าระบบ แก้ข้อมูลบัญชีที่ยังไม่ผูก และบันทึกข้อมูลบุคลากรแทน ERP เมื่อ ERP ไม่มีข้อมูล'
 WHERE code = 'user_account:create';

-- Down Migration
UPDATE permissions
   SET description_th = 'เพิ่มผู้ใช้ล่วงหน้าสำหรับบุคลากรที่ยังไม่เคยเข้าระบบ และแก้ข้อมูลบัญชีที่ยังไม่ผูก'
 WHERE code = 'user_account:create';
