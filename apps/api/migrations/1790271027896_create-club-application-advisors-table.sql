-- Up Migration
-- ที่ปรึกษาที่เสนอในคำขอ (≤ 2 คน) ระบุด้วย email; user_id เติมเมื่อรู้ว่าเป็นผู้ใช้คนไหน
-- ที่ปรึกษาต้อง login ด้วย email นี้แล้วกดยินยอมเอง
CREATE TABLE club_application_advisors (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  application_id uuid        NOT NULL REFERENCES club_applications (id) ON DELETE CASCADE,
  email          text        NOT NULL,
  user_id        uuid        REFERENCES users (id) ON DELETE RESTRICT,
  sort_order     smallint    NOT NULL,
  consent_status text        NOT NULL DEFAULT 'pending',
  responded_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_application_advisors_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT club_application_advisors_sort_order_range CHECK (sort_order BETWEEN 1 AND 2),
  CONSTRAINT club_application_advisors_consent_status_check CHECK (consent_status IN ('pending', 'accepted', 'declined')),
  CONSTRAINT club_application_advisors_responded_consistency CHECK ((consent_status = 'pending') = (responded_at IS NULL)),
  CONSTRAINT club_application_advisors_email_key UNIQUE (application_id, email),
  CONSTRAINT club_application_advisors_sort_order_key UNIQUE (application_id, sort_order)
);

-- ที่ปรึกษา login แล้วหาคำขอที่รอตนยินยอมจาก email
CREATE INDEX club_application_advisors_email_idx ON club_application_advisors (email);
CREATE INDEX club_application_advisors_user_id_idx ON club_application_advisors (user_id);

CREATE TRIGGER club_application_advisors_set_updated_at
  BEFORE UPDATE ON club_application_advisors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_application_advisors;
