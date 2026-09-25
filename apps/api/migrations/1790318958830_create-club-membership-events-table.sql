-- Up Migration
-- ประวัติการเป็นสมาชิก (ใครทำอะไร เมื่อไร เพราะอะไร) แก้/ลบไม่ได้
CREATE TABLE club_membership_events (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  membership_id uuid        NOT NULL REFERENCES club_memberships (id) ON DELETE RESTRICT,
  -- NULL = ระบบเป็นผู้ทำ (เช่น สมาชิกตั้งต้นจากการอนุมัติจัดตั้งชมรม)
  actor_user_id uuid        REFERENCES users (id) ON DELETE RESTRICT,
  action        text        NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_membership_events_action_check
    CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed'))
);

CREATE INDEX club_membership_events_membership_id_idx ON club_membership_events (membership_id, created_at);
CREATE INDEX club_membership_events_actor_user_id_idx ON club_membership_events (actor_user_id);

CREATE TRIGGER club_membership_events_immutable
  BEFORE UPDATE OR DELETE ON club_membership_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE club_membership_events;
