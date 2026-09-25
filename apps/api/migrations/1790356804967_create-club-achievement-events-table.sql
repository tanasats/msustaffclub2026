-- Up Migration
-- ประวัติของผลงาน (ใครทำอะไร เมื่อไร เพราะอะไร) แก้/ลบไม่ได้ — เจ้าของใช้ติดตามสถานะ
CREATE TABLE club_achievement_events (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  achievement_id uuid        NOT NULL REFERENCES club_achievements (id) ON DELETE RESTRICT,
  actor_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action         text        NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_achievement_events_action_check
    CHECK (action IN ('submitted', 'updated', 'resubmitted', 'withdrawn', 'approved', 'returned', 'rejected'))
);

CREATE INDEX club_achievement_events_achievement_id_idx ON club_achievement_events (achievement_id, created_at);
CREATE INDEX club_achievement_events_actor_user_id_idx ON club_achievement_events (actor_user_id);

CREATE TRIGGER club_achievement_events_immutable
  BEFORE UPDATE OR DELETE ON club_achievement_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE club_achievement_events;
