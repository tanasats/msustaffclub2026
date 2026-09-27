-- Up Migration
-- ค่าตั้งค่าของระบบแบบ key/value (เช่น email.enabled) แก้ได้ผ่านหน้าตั้งค่าโดยผู้มี system_setting:manage
-- ไม่มีข้อมูลตั้งต้น: key ที่ยังไม่มีแถว = ใช้ค่าเริ่มต้นในโค้ด (src/services/system-settings-service.ts)
CREATE TABLE system_settings (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  key         text        NOT NULL,
  value       jsonb       NOT NULL,
  updated_by  uuid        REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_key_key UNIQUE (key),
  CONSTRAINT system_settings_key_format CHECK (key ~ '^[a-z][a-z0-9_.]*$')
);

CREATE INDEX system_settings_updated_by_idx ON system_settings (updated_by);

CREATE TRIGGER system_settings_set_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE system_settings;
