-- Up Migration
-- ประวัติการดำรงตำแหน่งกรรมการ (ใครแต่งตั้ง/ให้พ้นตำแหน่ง เมื่อไร เพราะอะไร) แก้/ลบไม่ได้
-- แถวใน club_committee_members บอก "สถานะ" ของตำแหน่ง ส่วนตารางนี้บอก "ผู้กระทำ" และหมายเหตุ
CREATE TABLE club_committee_events (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  committee_member_id uuid        NOT NULL REFERENCES club_committee_members (id) ON DELETE RESTRICT,
  -- NULL = ระบบเป็นผู้ทำ (เช่น กรรมการชุดแรกจากการอนุมัติจัดตั้งชมรม)
  actor_user_id       uuid        REFERENCES users (id) ON DELETE RESTRICT,
  -- appointed = รับตำแหน่ง, ended = พ้นตำแหน่ง (เหตุอยู่ที่ club_committee_members.end_reason)
  action              text        NOT NULL,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_committee_events_action_check CHECK (action IN ('appointed', 'ended'))
);

CREATE INDEX club_committee_events_committee_member_id_idx ON club_committee_events (committee_member_id, created_at);
CREATE INDEX club_committee_events_actor_user_id_idx ON club_committee_events (actor_user_id);

CREATE TRIGGER club_committee_events_immutable
  BEFORE UPDATE OR DELETE ON club_committee_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE club_committee_events;
