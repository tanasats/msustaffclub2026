-- Up Migration
-- ระบุตัวผู้ใช้ด้วย google_sub (ไม่เปลี่ยน) ไม่ใช่ email (เปลี่ยนได้)
-- ไม่ลบผู้ใช้จริง ใช้ is_active = false แทน
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  google_sub    text        NOT NULL,
  email         text        NOT NULL,
  name          text,
  picture_url   text,
  is_active     boolean     NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_google_sub_key UNIQUE (google_sub),
  -- เก็บ email เป็นตัวพิมพ์เล็กเสมอ เพื่อค้นหาด้วย = ได้ตรง ๆ และใช้ index ได้
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

-- email ไม่ UNIQUE เพราะบัญชี Google เดิมอาจถูกลบแล้ว email ถูกนำไปใช้ใหม่ (google_sub ต่างกัน)
CREATE INDEX users_email_idx ON users (email);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE users;
