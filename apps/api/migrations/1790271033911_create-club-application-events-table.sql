-- Up Migration
-- ประวัติการเปลี่ยนสถานะคำขอ (ใคร, จาก, ไป, หมายเหตุ, เมื่อไร) แก้/ลบไม่ได้
CREATE TABLE club_application_events (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  application_id uuid        NOT NULL REFERENCES club_applications (id) ON DELETE RESTRICT,
  -- NULL = ระบบเป็นผู้ทำ
  actor_user_id  uuid        REFERENCES users (id) ON DELETE RESTRICT,
  -- NULL = เหตุการณ์สร้างคำขอ
  from_status    text,
  to_status      text        NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX club_application_events_application_id_idx ON club_application_events (application_id, created_at);
CREATE INDEX club_application_events_actor_user_id_idx ON club_application_events (actor_user_id);

CREATE TRIGGER club_application_events_immutable
  BEFORE UPDATE OR DELETE ON club_application_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE club_application_events;
