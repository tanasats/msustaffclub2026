-- Up Migration
-- ค่าสถิติรายบุคคลในแต่ละการแข่งขัน (ข้อมูลภายใน: เห็นเฉพาะตัวนักกีฬา กรรมการชมรม และผู้คัดเลือก)
CREATE TABLE sport_result_stats (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  result_id           uuid        NOT NULL REFERENCES sport_competition_results (id) ON DELETE CASCADE,
  stat_definition_id  uuid        NOT NULL REFERENCES sport_stat_definitions (id) ON DELETE RESTRICT,
  value               numeric(12, 3) NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_result_stats_result_stat_key UNIQUE (result_id, stat_definition_id)
);

-- หาสถิติดีที่สุดต่อค่าสถิติ
CREATE INDEX sport_result_stats_stat_definition_id_idx ON sport_result_stats (stat_definition_id);

CREATE TRIGGER sport_result_stats_set_updated_at
  BEFORE UPDATE ON sport_result_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE sport_result_stats;
