-- Up Migration
-- คณะกรรมการบริหารชมรม เก็บประวัติทุกวาระ (สิ้นสุดตำแหน่ง = ใส่ ended_on + end_reason ไม่ลบแถว)
CREATE TABLE club_committee_members (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id        uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  position_id    uuid        NOT NULL REFERENCES club_positions (id) ON DELETE RESTRICT,
  -- ชื่อตำแหน่งที่แสดง เช่น "รองประธานคนที่ 1", "ฝ่ายสวัสดิการ"
  position_title text        NOT NULL,
  sort_order     integer     NOT NULL DEFAULT 0,
  work_location  text,
  contact_phone  text,
  bio            text,
  started_on     date        NOT NULL,
  ended_on       date,
  -- เหตุสิ้นสุดตามระเบียบข้อ 12
  end_reason     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_committee_members_position_title_not_blank CHECK (btrim(position_title) <> ''),
  CONSTRAINT club_committee_members_dates_order CHECK (ended_on IS NULL OR ended_on >= started_on),
  CONSTRAINT club_committee_members_end_consistency CHECK ((ended_on IS NULL) = (end_reason IS NULL)),
  CONSTRAINT club_committee_members_end_reason_check CHECK (
    end_reason IN ('term_ended', 'resigned_position', 'left_university', 'disciplinary',
                   'removed_by_resolution', 'deceased', 'club_dissolved', 'replaced')
  )
);

-- กรรมการชุดปัจจุบันของชมรม (partial index เล็ก เพราะเก็บเฉพาะที่ยังไม่สิ้นสุด)
CREATE INDEX club_committee_members_current_idx ON club_committee_members (club_id, user_id) WHERE ended_on IS NULL;
CREATE INDEX club_committee_members_user_id_idx ON club_committee_members (user_id);
CREATE INDEX club_committee_members_position_id_idx ON club_committee_members (position_id);

CREATE TRIGGER club_committee_members_set_updated_at
  BEFORE UPDATE ON club_committee_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_committee_members;
