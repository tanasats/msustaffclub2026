-- Up Migration
-- แหล่งข้อมูลบุคลากร: erp = ดึงจาก ERP-HR ตอน login, admin = ผู้ดูแลระบบกรอกตอนเพิ่มบัญชีล่วงหน้า (ไม่มีรหัสบุคลากร)
-- เมื่อเจ้าตัว login และ ERP ตอบ ข้อมูลจะถูกแทนด้วย ERP (source = erp) ตามเดิม
ALTER TABLE staff_profiles ALTER COLUMN staff_code DROP NOT NULL;
ALTER TABLE staff_profiles ADD COLUMN source text NOT NULL DEFAULT 'erp';
ALTER TABLE staff_profiles ADD CONSTRAINT staff_profiles_source_check CHECK (source IN ('erp', 'admin'));
-- ข้อมูลจาก ERP ต้องมีรหัสบุคลากรเสมอ
ALTER TABLE staff_profiles ADD CONSTRAINT staff_profiles_erp_has_code CHECK (source = 'admin' OR staff_code IS NOT NULL);

-- Down Migration
-- ย้อนได้เฉพาะเมื่อไม่มีข้อมูลที่ผู้ดูแลกรอก (ไม่มีรหัสบุคลากร) — ถ้ามี SET NOT NULL จะล้ม
ALTER TABLE staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_erp_has_code;
ALTER TABLE staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_source_check;
ALTER TABLE staff_profiles DROP COLUMN IF EXISTS source;
ALTER TABLE staff_profiles ALTER COLUMN staff_code SET NOT NULL;
