-- Up Migration
-- การแข่งขันที่นักกีฬาของชมรมเข้าร่วม (บันทึกโดยผู้มีสิทธิ์ชมรม club_sport:manage)
CREATE TABLE sport_competitions (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id      uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  sport_id     uuid        NOT NULL REFERENCES sports (id) ON DELETE RESTRICT,
  title        text        NOT NULL,
  -- ประเภท/รุ่นที่แข่ง เช่น "ชายเดี่ยว", "10 กม. อายุ 40+"
  event_name   text,
  -- ระดับเดียวกับผลงาน (ระยะที่ 3)
  level        text        NOT NULL,
  format       text        NOT NULL DEFAULT 'individual',
  held_from    date        NOT NULL,
  held_to      date,
  location     text,
  organizer    text,
  note         text,
  recorded_by  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT sport_competitions_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT sport_competitions_level_check
    CHECK (level IN ('international', 'national', 'regional', 'provincial', 'university', 'club')),
  CONSTRAINT sport_competitions_format_check CHECK (format IN ('individual', 'team')),
  CONSTRAINT sport_competitions_dates_order CHECK (held_to IS NULL OR held_to >= held_from)
);

-- การแข่งขันของชมรมตามช่วงวันที่ (ปีงบประมาณ) ไม่รวมที่ลบแล้ว
CREATE INDEX sport_competitions_club_held_idx ON sport_competitions (club_id, held_from DESC) WHERE deleted_at IS NULL;
CREATE INDEX sport_competitions_sport_id_idx ON sport_competitions (sport_id);
CREATE INDEX sport_competitions_recorded_by_idx ON sport_competitions (recorded_by);

CREATE TRIGGER sport_competitions_set_updated_at
  BEFORE UPDATE ON sport_competitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE sport_competitions;
