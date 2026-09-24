-- Up Migration
-- ที่ปรึกษาชมรม (≤ 2 คนต่อชมรม ตรวจที่ service) วาระตามปีงบประมาณ
CREATE TABLE club_advisors (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id     uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  fiscal_year integer     NOT NULL,
  started_on  date        NOT NULL,
  -- NULL = ยังเป็นที่ปรึกษาอยู่
  ended_on    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_advisors_fiscal_year_range CHECK (fiscal_year BETWEEN 2500 AND 2700),
  CONSTRAINT club_advisors_dates_order CHECK (ended_on IS NULL OR ended_on >= started_on)
);

-- คนเดียวกันเป็นที่ปรึกษาที่ยังไม่สิ้นสุดของชมรมเดียวกันได้ครั้งเดียว
CREATE UNIQUE INDEX club_advisors_current_key ON club_advisors (club_id, user_id) WHERE ended_on IS NULL;
-- ใช้หา "ชมรมที่ฉันเป็นที่ปรึกษา"
CREATE INDEX club_advisors_user_id_idx ON club_advisors (user_id);

CREATE TRIGGER club_advisors_set_updated_at
  BEFORE UPDATE ON club_advisors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_advisors;
