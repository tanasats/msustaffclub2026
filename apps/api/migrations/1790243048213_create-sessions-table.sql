-- Up Migration
-- เก็บเฉพาะ SHA-256 ของ token (32 bytes) ไม่เก็บ token ดิบ ถ้าฐานข้อมูลรั่วก็นำไปใช้ login ไม่ได้
-- session เป็นข้อมูลชั่วคราว ออกจากระบบ/หมดอายุ = ลบแถวจริง
CREATE TABLE sessions (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  token_hash   bytea       NOT NULL,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sessions_token_hash_length CHECK (octet_length(token_hash) = 32)
);

-- ใช้ตอนเพิกถอน session ทั้งหมดของผู้ใช้ (เช่น ถูกปิดบัญชี)
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
-- ใช้ตอนลบ session ที่หมดอายุเป็นชุด
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE sessions;
