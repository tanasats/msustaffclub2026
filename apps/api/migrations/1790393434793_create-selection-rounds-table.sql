-- Up Migration
-- รอบคัดเลือก: ตัวแทน (ต่อชนิดกีฬา) หรือรางวัลเชิดชูเกียรติ (ทุกชนิดกีฬา) ใช้ข้อมูลของปีงบประมาณที่กำหนด
-- ระบบเรียงข้อมูลให้ คนเป็นผู้ตัดสินพร้อมเหตุผล (selection_candidates) แล้วปิดรอบ
CREATE TABLE selection_rounds (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  kind         text        NOT NULL,
  title        text        NOT NULL,
  -- ตัวแทน: ต้องระบุชนิดกีฬา / รางวัล: ไม่ระบุ (ทุกชนิดกีฬา)
  sport_id     uuid        REFERENCES sports (id) ON DELETE RESTRICT,
  event_name   text,
  fiscal_year  integer     NOT NULL,
  criteria     text,
  -- จำนวนที่ต้องการคัดเลือก (ไม่บังคับ ใช้แสดงผล)
  slots        integer,
  status       text        NOT NULL DEFAULT 'open',
  created_by   uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  closed_by    uuid        REFERENCES users (id) ON DELETE RESTRICT,
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT selection_rounds_kind_check CHECK (kind IN ('representative', 'award')),
  CONSTRAINT selection_rounds_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT selection_rounds_sport_by_kind CHECK ((kind = 'representative') = (sport_id IS NOT NULL)),
  CONSTRAINT selection_rounds_fiscal_year_range CHECK (fiscal_year BETWEEN 2500 AND 2700),
  CONSTRAINT selection_rounds_slots_positive CHECK (slots IS NULL OR slots > 0),
  CONSTRAINT selection_rounds_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT selection_rounds_closed_consistency CHECK ((status = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL))
);

CREATE INDEX selection_rounds_year_idx ON selection_rounds (fiscal_year DESC, created_at DESC);
CREATE INDEX selection_rounds_sport_id_idx ON selection_rounds (sport_id) WHERE sport_id IS NOT NULL;
CREATE INDEX selection_rounds_created_by_idx ON selection_rounds (created_by);

CREATE TRIGGER selection_rounds_set_updated_at
  BEFORE UPDATE ON selection_rounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE selection_rounds;
