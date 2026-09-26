-- Up Migration
-- ผลรายบุคคลของการแข่งขัน: อันดับ/เหรียญ (สาธารณะ) — แบบทีมให้ทุกคนในทีมได้ผลเดียวกัน
CREATE TABLE sport_competition_results (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  competition_id  uuid        NOT NULL REFERENCES sport_competitions (id) ON DELETE RESTRICT,
  user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  rank            integer,
  medal           text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_competition_results_competition_user_key UNIQUE (competition_id, user_id),
  CONSTRAINT sport_competition_results_rank_positive CHECK (rank IS NULL OR rank > 0),
  CONSTRAINT sport_competition_results_medal_check CHECK (medal IS NULL OR medal IN ('gold', 'silver', 'bronze'))
);

-- ผลการแข่งขันของนักกีฬา (หน้าสรุปนักกีฬา / การคัดเลือก)
CREATE INDEX sport_competition_results_user_id_idx ON sport_competition_results (user_id);

CREATE TRIGGER sport_competition_results_set_updated_at
  BEFORE UPDATE ON sport_competition_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE sport_competition_results;
