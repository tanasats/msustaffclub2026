-- Up Migration
-- คณะกรรมการบริหารที่เสนอในคำขอ (ต้องเป็นผู้ใช้ที่เคย login แล้ว) 1 คนมี 1 ตำแหน่งต่อคำขอ
CREATE TABLE club_application_committee (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  application_id uuid        NOT NULL REFERENCES club_applications (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  position_id    uuid        NOT NULL REFERENCES club_positions (id) ON DELETE RESTRICT,
  position_title text        NOT NULL,
  sort_order     integer     NOT NULL DEFAULT 0,
  work_location  text,
  contact_phone  text,
  bio            text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_application_committee_position_title_not_blank CHECK (btrim(position_title) <> ''),
  CONSTRAINT club_application_committee_user_key UNIQUE (application_id, user_id)
);

CREATE INDEX club_application_committee_user_id_idx ON club_application_committee (user_id);
CREATE INDEX club_application_committee_position_id_idx ON club_application_committee (position_id);

CREATE TRIGGER club_application_committee_set_updated_at
  BEFORE UPDATE ON club_application_committee
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_application_committee;
