-- Up Migration
-- ไฟล์ที่เก็บใน Garage (S3) — ตัวไฟล์อยู่ใน bucket ส่วนตารางนี้เก็บข้อมูลอ้างอิง
-- object_key ใช้ UUID (ไม่ใช้ชื่อไฟล์ต้นฉบับ) ชื่อเดิมเก็บใน original_name
-- status: pending = ออก URL อัปโหลดแล้วแต่ยังไม่ยืนยัน, uploaded = ตรวจแล้วว่าไฟล์อยู่ใน bucket จริง
CREATE TABLE files (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  bucket        text        NOT NULL,
  object_key    text        NOT NULL,
  original_name text        NOT NULL,
  mime_type     text        NOT NULL,
  size_bytes    bigint      NOT NULL,
  -- วัตถุประสงค์ของไฟล์ (กำหนดชนิด/ขนาดที่อนุญาตและใครเข้าถึงได้)
  purpose       text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  uploaded_by   uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  uploaded_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT files_object_key_key UNIQUE (bucket, object_key),
  CONSTRAINT files_size_positive CHECK (size_bytes > 0),
  CONSTRAINT files_purpose_check CHECK (purpose IN ('advisor_consent')),
  CONSTRAINT files_status_check CHECK (status IN ('pending', 'uploaded')),
  CONSTRAINT files_uploaded_consistency CHECK ((status = 'uploaded') = (uploaded_at IS NOT NULL)),
  CONSTRAINT files_original_name_not_blank CHECK (btrim(original_name) <> '')
);

-- ไฟล์ของผู้ใช้แต่ละคน / ไฟล์ค้างสถานะ pending (ใช้ล้างทิ้งภายหลัง)
CREATE INDEX files_uploaded_by_idx ON files (uploaded_by);
CREATE INDEX files_pending_created_at_idx ON files (created_at) WHERE status = 'pending';

CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE files;
