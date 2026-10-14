-- Up Migration
-- ประวัติข้อความที่ส่งถึงผู้ใช้หลายคน: ประกาศของสโมสรบุคลากร (staff_announcement) และข้อความของชมรมถึงสมาชิก (club_message)
-- ตัวข้อความถึงผู้รับแต่ละคนอยู่ใน notifications (+ อีเมลตามค่าตั้ง) — ตารางนี้เก็บเป็นหลักฐานว่าใครส่งอะไรถึงกลุ่มใด กี่คน (แก้/ลบไม่ได้)
CREATE TABLE broadcast_messages (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  kind            text        NOT NULL,
  sender_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- ชมรมที่ส่ง (เฉพาะ club_message)
  club_id         uuid        REFERENCES clubs (id) ON DELETE RESTRICT,
  -- กลุ่มผู้รับ: all_staff / club_committees / club_members / org_units (ประกาศสโมสร), club (ข้อความชมรม)
  audience        text        NOT NULL,
  -- หน่วยงานที่เลือก (เฉพาะ audience = org_units)
  org_unit_ids    uuid[],
  title           text        NOT NULL,
  body            text        NOT NULL,
  recipient_count integer     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_messages_kind_check CHECK (kind IN ('staff_announcement', 'club_message')),
  CONSTRAINT broadcast_messages_audience_check CHECK (
    (kind = 'staff_announcement' AND club_id IS NULL AND audience IN ('all_staff', 'club_committees', 'club_members', 'org_units'))
    OR (kind = 'club_message' AND club_id IS NOT NULL AND audience = 'club')
  ),
  CONSTRAINT broadcast_messages_org_units_check CHECK ((audience = 'org_units') = (cardinality(org_unit_ids) > 0)),
  CONSTRAINT broadcast_messages_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT broadcast_messages_body_not_blank CHECK (btrim(body) <> ''),
  CONSTRAINT broadcast_messages_recipient_count_check CHECK (recipient_count > 0)
);

-- ประวัติประกาศของสโมสร / ของแต่ละชมรม ใหม่สุดก่อน
CREATE INDEX broadcast_messages_kind_created_at_idx ON broadcast_messages (kind, created_at DESC);
CREATE INDEX broadcast_messages_club_id_created_at_idx ON broadcast_messages (club_id, created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX broadcast_messages_sender_user_id_idx ON broadcast_messages (sender_user_id);

CREATE TRIGGER broadcast_messages_set_updated_at
  BEFORE UPDATE ON broadcast_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER broadcast_messages_immutable
  BEFORE UPDATE OR DELETE ON broadcast_messages
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE broadcast_messages;
