-- Up Migration
-- นักกีฬาของชมรม: สมาชิก active ลงทะเบียนกับชนิดกีฬาของชมรม พร้อมประเภท/ตำแหน่ง (เช่น "ผู้รักษาประตู", "10 กม.")
-- ไม่เก็บข้อมูลสุขภาพ (น้ำหนัก ส่วนสูง การบาดเจ็บ) ตาม PDPA — ยืนยันแล้วในระยะที่ 5
CREATE TABLE club_athletes (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id            uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id            uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  sport_id           uuid        NOT NULL REFERENCES sports (id) ON DELETE RESTRICT,
  event_or_position  text,
  -- สิ้นสุดการเป็นนักกีฬา (เลิกเอง/ผู้จัดการทีมให้พ้น/พ้นสมาชิก) ไม่ลบแถว เก็บเป็นประวัติ
  ended_at           timestamptz,
  ended_by           uuid        REFERENCES users (id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_athletes_end_consistency CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);

-- นักกีฬา 1 คนลงทะเบียนกีฬาชนิดเดียวกันในชมรมเดียวกันได้ครั้งเดียวในขณะหนึ่ง (partial: เฉพาะที่ยังไม่สิ้นสุด)
CREATE UNIQUE INDEX club_athletes_current_key ON club_athletes (club_id, sport_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX club_athletes_user_id_idx ON club_athletes (user_id);
CREATE INDEX club_athletes_sport_id_idx ON club_athletes (sport_id);
CREATE INDEX club_athletes_ended_by_idx ON club_athletes (ended_by) WHERE ended_by IS NOT NULL;

CREATE TRIGGER club_athletes_set_updated_at
  BEFORE UPDATE ON club_athletes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_athletes;
