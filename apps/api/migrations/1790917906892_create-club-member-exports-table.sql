-- Up Migration
-- บันทึกการส่งออกรายชื่อสมาชิก (เปิดเผยข้อมูลส่วนบุคคล — PDPA) ใครส่งออก ชมรมไหน ตัวกรองอะไร กี่แถว
-- ไม่เก็บรายชื่อที่ส่งออก (เก็บเท่าที่จำเป็นต่อการตรวจสอบ) แก้/ลบไม่ได้
CREATE TABLE club_member_exports (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id     uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  exported_by uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  filter      jsonb       NOT NULL DEFAULT '{}',
  row_count   integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_member_exports_row_count_check CHECK (row_count >= 0)
);

CREATE INDEX club_member_exports_club_id_idx ON club_member_exports (club_id, created_at DESC);
CREATE INDEX club_member_exports_exported_by_idx ON club_member_exports (exported_by);

CREATE TRIGGER club_member_exports_set_updated_at
  BEFORE UPDATE ON club_member_exports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER club_member_exports_immutable
  BEFORE UPDATE OR DELETE ON club_member_exports
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE club_member_exports;
