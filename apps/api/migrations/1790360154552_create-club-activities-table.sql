-- Up Migration
-- กิจกรรมที่ชมรมจัดจริง (อ้างอิงแผนได้) ใช้ประกอบรายงานรายเดือน/ประจำปี (ระเบียบข้อ 16)
CREATE TABLE club_activities (
  id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id              uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  planned_activity_id  uuid        REFERENCES club_planned_activities (id) ON DELETE RESTRICT,
  held_on              date        NOT NULL,
  time_text            text,
  title                text        NOT NULL,
  location             text,
  summary              text,
  -- จำนวนผู้เข้าร่วม: ถ้าเลือกรายชื่อสมาชิก ระบบนับให้ ไม่เลือก = กรอกเอง (รวมผู้ที่ไม่ใช่สมาชิกได้)
  participant_count    integer,
  recorded_by          uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT club_activities_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT club_activities_participant_count_non_negative CHECK (participant_count IS NULL OR participant_count >= 0)
);

-- กิจกรรมของชมรมตามช่วงวันที่ (รายเดือน/รายปี) ไม่รวมที่ลบแล้ว
CREATE INDEX club_activities_club_held_on_idx ON club_activities (club_id, held_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX club_activities_planned_activity_id_idx ON club_activities (planned_activity_id) WHERE planned_activity_id IS NOT NULL;
CREATE INDEX club_activities_recorded_by_idx ON club_activities (recorded_by);

CREATE TRIGGER club_activities_set_updated_at
  BEFORE UPDATE ON club_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_activities;
