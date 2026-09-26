-- Up Migration
-- ค่าสถิติของแต่ละชนิดกีฬา (เจ้าหน้าที่กำหนดเอง ระบบไม่ต้องรู้กติกากีฬา) เช่น ฟุตบอล: ประตู / วิ่ง: เวลา (นาที)
-- better: higher = ค่ามากดีกว่า, lower = ค่าน้อยดีกว่า (ใช้หา "สถิติดีที่สุด")
CREATE TABLE sport_stat_definitions (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  sport_id    uuid        NOT NULL REFERENCES sports (id) ON DELETE RESTRICT,
  code        text        NOT NULL,
  name_th     text        NOT NULL,
  unit        text,
  better      text        NOT NULL DEFAULT 'higher',
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_stat_definitions_sport_code_key UNIQUE (sport_id, code),
  CONSTRAINT sport_stat_definitions_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT sport_stat_definitions_name_not_blank CHECK (btrim(name_th) <> ''),
  CONSTRAINT sport_stat_definitions_better_check CHECK (better IN ('higher', 'lower'))
);

CREATE TRIGGER sport_stat_definitions_set_updated_at
  BEFORE UPDATE ON sport_stat_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE sport_stat_definitions;
