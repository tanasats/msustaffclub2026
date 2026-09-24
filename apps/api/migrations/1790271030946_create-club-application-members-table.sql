-- Up Migration
-- สมาชิกตั้งต้นที่เสนอในคำขอ (นอกเหนือจากกรรมการ ซึ่งนับเป็นสมาชิกโดยอัตโนมัติ)
CREATE TABLE club_application_members (
  application_id uuid        NOT NULL REFERENCES club_applications (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, user_id)
);

CREATE INDEX club_application_members_user_id_idx ON club_application_members (user_id);

-- Down Migration
DROP TABLE club_application_members;
