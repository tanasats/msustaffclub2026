-- Up Migration
-- ผลการตัดสินรายบุคคลในรอบคัดเลือก (คัดเลือก / สำรอง / ไม่คัดเลือก) ต้องมีเหตุผลทุกครั้ง
CREATE TABLE selection_candidates (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  round_id    uuid        NOT NULL REFERENCES selection_rounds (id) ON DELETE RESTRICT,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decision    text        NOT NULL,
  reason      text        NOT NULL,
  decided_by  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT selection_candidates_round_user_key UNIQUE (round_id, user_id),
  CONSTRAINT selection_candidates_decision_check CHECK (decision IN ('selected', 'reserve', 'not_selected')),
  CONSTRAINT selection_candidates_reason_not_blank CHECK (btrim(reason) <> '')
);

CREATE INDEX selection_candidates_user_id_idx ON selection_candidates (user_id);
CREATE INDEX selection_candidates_decided_by_idx ON selection_candidates (decided_by);

CREATE TRIGGER selection_candidates_set_updated_at
  BEFORE UPDATE ON selection_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE selection_candidates;
