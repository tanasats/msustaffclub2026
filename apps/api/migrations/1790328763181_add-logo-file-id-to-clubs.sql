-- Up Migration
-- รูปตราสัญลักษณ์ของชมรม (ไม่บังคับ) แก้ได้โดยผู้มีสิทธิ์ชมรม club_profile:edit
ALTER TABLE clubs ADD COLUMN logo_file_id uuid REFERENCES files (id) ON DELETE RESTRICT;

CREATE INDEX clubs_logo_file_id_idx ON clubs (logo_file_id) WHERE logo_file_id IS NOT NULL;

-- Down Migration
ALTER TABLE clubs DROP COLUMN logo_file_id;
