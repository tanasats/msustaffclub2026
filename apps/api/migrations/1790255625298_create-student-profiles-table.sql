-- Up Migration
-- ข้อมูลนิสิต (1 ผู้ใช้ : 1 แถว) ได้จาก email ตอน login
CREATE TABLE student_profiles (
  user_id      uuid        PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
  student_code text        NOT NULL,
  -- คณะจากหลักที่ 5-6 ของรหัสนิสิต, NULL = ไม่พบรหัสคณะนี้ในตาราง org_units
  org_unit_id  uuid        REFERENCES org_units (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_profiles_student_code_key UNIQUE (student_code),
  CONSTRAINT student_profiles_student_code_format CHECK (student_code ~ '^[0-9]{11}$')
);

-- ใช้ค้นนิสิตตามคณะ
CREATE INDEX student_profiles_org_unit_id_idx ON student_profiles (org_unit_id);

CREATE TRIGGER student_profiles_set_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE student_profiles;
