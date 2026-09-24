-- Up Migration
-- ข้อมูลบุคลากรจาก ERP-HR (1 ผู้ใช้ : 1 แถว) ดึงใหม่ทุกครั้งที่ login
-- เก็บรหัส/ชื่อหน่วยงานตามที่ ERP ส่งมา (รหัส ERP เป็นคนละชุดกับ org_units.code)
-- ไม่เก็บเบอร์โทรศัพท์ (PDPA: เก็บเท่าที่จำเป็น)
CREATE TABLE staff_profiles (
  user_id             uuid        PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  staff_code          text        NOT NULL,
  prefix_name_th      text,
  first_name_th       text,
  last_name_th        text,
  prefix_name_en      text,
  first_name_en       text,
  last_name_en        text,
  position_name_th    text,
  erp_faculty_id      text,
  erp_faculty_name    text,
  erp_department_id   text,
  erp_department_name text,
  erp_program_id      text,
  erp_program_name    text,
  -- เวลาที่ดึงข้อมูลจาก ERP สำเร็จล่าสุด
  synced_at           timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_staff_code_not_blank CHECK (btrim(staff_code) <> '')
);

-- ใช้ค้นบุคลากรจากรหัสพนักงาน (ไม่ UNIQUE เพราะ ERP เป็นเจ้าของข้อมูล ไม่ให้ข้อมูลภายนอกทำให้ login พัง)
CREATE INDEX staff_profiles_staff_code_idx ON staff_profiles (staff_code);

CREATE TRIGGER staff_profiles_set_updated_at
  BEFORE UPDATE ON staff_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE staff_profiles;
