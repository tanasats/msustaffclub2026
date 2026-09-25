-- Up Migration
-- รูปกิจกรรม สูงสุด 10 รูปต่อกิจกรรม (ตรวจที่ service)
CREATE TABLE club_activity_files (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  activity_id uuid        NOT NULL REFERENCES club_activities (id) ON DELETE RESTRICT,
  file_id     uuid        NOT NULL REFERENCES files (id) ON DELETE RESTRICT,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 1 ไฟล์ผูกได้กับกิจกรรมเดียว (ใช้ค้นจากไฟล์ → กิจกรรม ตอนตรวจสิทธิ์อ่านไฟล์ด้วย)
  CONSTRAINT club_activity_files_file_id_key UNIQUE (file_id)
);

CREATE INDEX club_activity_files_activity_id_idx ON club_activity_files (activity_id, sort_order);

CREATE TRIGGER club_activity_files_set_updated_at
  BEFORE UPDATE ON club_activity_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_activity_files;
