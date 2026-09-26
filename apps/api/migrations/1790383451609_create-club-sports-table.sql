-- Up Migration
-- ชนิดกีฬาของชมรม (ชมรมประเภท "ด้านสุขภาพ กีฬาและนันทนาการ" เลือกได้มากกว่า 1 ชนิด — ตรวจที่ service)
CREATE TABLE club_sports (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id     uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  sport_id    uuid        NOT NULL REFERENCES sports (id) ON DELETE RESTRICT,
  created_by  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_sports_club_sport_key UNIQUE (club_id, sport_id)
);

-- ชมรมที่เล่นกีฬาชนิดนี้ (unique ด้านบนครอบการค้นจากชมรมแล้ว)
CREATE INDEX club_sports_sport_id_idx ON club_sports (sport_id);
CREATE INDEX club_sports_created_by_idx ON club_sports (created_by);

CREATE TRIGGER club_sports_set_updated_at
  BEFORE UPDATE ON club_sports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_sports;
