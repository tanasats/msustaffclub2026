-- Up Migration
-- หน่วยงานของมหาวิทยาลัย (คณะ วิทยาลัย สำนัก กอง ฯลฯ) ใช้อ้างอิงคณะของนิสิต
-- code = รหัส 2 หลัก ตรงกับหลักที่ 5-6 ของรหัสนิสิต
CREATE TABLE org_units (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  code         text        NOT NULL,
  name_th      text        NOT NULL,
  -- true = หน่วยงานที่มีนิสิต (category A ในข้อมูลต้นทาง)
  has_students boolean     NOT NULL DEFAULT false,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_units_code_key UNIQUE (code),
  CONSTRAINT org_units_code_format CHECK (code ~ '^[0-9]{2}$'),
  CONSTRAINT org_units_name_th_not_blank CHECK (btrim(name_th) <> '')
);

CREATE TRIGGER org_units_set_updated_at
  BEFORE UPDATE ON org_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE org_units;
