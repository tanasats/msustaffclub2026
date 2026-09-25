-- Up Migration
-- สมาชิกที่เข้าร่วมกิจกรรม (ไม่บังคับ) ใช้ประกอบการคัดเลือกรางวัล/สถิติในอนาคต
CREATE TABLE club_activity_participants (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  activity_id uuid        NOT NULL REFERENCES club_activities (id) ON DELETE RESTRICT,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_activity_participants_activity_user_key UNIQUE (activity_id, user_id)
);

-- กิจกรรมที่ผู้ใช้เคยเข้าร่วม (ค้นจากผู้ใช้)
CREATE INDEX club_activity_participants_user_id_idx ON club_activity_participants (user_id);

CREATE TRIGGER club_activity_participants_set_updated_at
  BEFORE UPDATE ON club_activity_participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_activity_participants;
