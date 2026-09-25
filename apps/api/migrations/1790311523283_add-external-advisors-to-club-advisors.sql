-- Up Migration
-- ที่ปรึกษาชมรม = บุคลากร (user_id) หรือ บุคคลภายนอก (external_person_id) อย่างใดอย่างหนึ่ง
-- บุคคลภายนอกไม่มีบัญชี จึงไม่ได้สิทธิ์ระดับชมรม (club-access-repository อ่านเฉพาะ user_id)
ALTER TABLE club_advisors
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN external_person_id uuid REFERENCES external_persons (id) ON DELETE RESTRICT,
  ADD CONSTRAINT club_advisors_kind_check CHECK ((user_id IS NULL) <> (external_person_id IS NULL));

CREATE UNIQUE INDEX club_advisors_current_external_key ON club_advisors (club_id, external_person_id)
  WHERE ended_on IS NULL AND external_person_id IS NOT NULL;
CREATE INDEX club_advisors_external_person_id_idx ON club_advisors (external_person_id);

-- Down Migration
DELETE FROM club_advisors WHERE external_person_id IS NOT NULL;
DROP INDEX club_advisors_external_person_id_idx;
DROP INDEX club_advisors_current_external_key;
ALTER TABLE club_advisors
  DROP CONSTRAINT club_advisors_kind_check,
  DROP COLUMN external_person_id,
  ALTER COLUMN user_id SET NOT NULL;
