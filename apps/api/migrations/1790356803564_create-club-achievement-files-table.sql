-- Up Migration
-- ไฟล์หลักฐานของผลงาน (เกียรติบัตร/รูปภาพ) สูงสุด 5 ไฟล์ต่อผลงาน (ตรวจที่ service)
CREATE TABLE club_achievement_files (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  achievement_id uuid        NOT NULL REFERENCES club_achievements (id) ON DELETE RESTRICT,
  file_id        uuid        NOT NULL REFERENCES files (id) ON DELETE RESTRICT,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- 1 ไฟล์ผูกได้กับผลงานเดียว (unique index นี้ใช้ค้นจากไฟล์ → ผลงาน ตอนตรวจสิทธิ์อ่านไฟล์ด้วย)
  CONSTRAINT club_achievement_files_file_id_key UNIQUE (file_id)
);

CREATE INDEX club_achievement_files_achievement_id_idx ON club_achievement_files (achievement_id, sort_order);

CREATE TRIGGER club_achievement_files_set_updated_at
  BEFORE UPDATE ON club_achievement_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_achievement_files;
