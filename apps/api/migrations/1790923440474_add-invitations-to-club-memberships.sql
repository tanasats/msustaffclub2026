-- Up Migration
-- กรรมการเชิญบุคลากรเข้าชมรม → ผู้ถูกเชิญตอบรับ (เป็นสมาชิกทันที) / ปฏิเสธ — ไม่เพิ่มชื่อคนอื่นโดยเจ้าตัวไม่รู้ (PDPA)
-- invited = รอตอบ, declined = ปฏิเสธคำเชิญ (กรรมการยกเลิกคำเชิญ → withdrawn) ขยายค่าที่ยอมรับเท่านั้น ข้อมูลเดิมไม่เปลี่ยน
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_status_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'ended', 'withdrawn', 'deleted', 'invited', 'declined'));

-- ผู้เชิญ (NULL = สมัครเอง)
ALTER TABLE club_memberships ADD COLUMN invited_by uuid REFERENCES users (id) ON DELETE RESTRICT;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_invited_consistency
  CHECK (status NOT IN ('invited', 'declined') OR invited_by IS NOT NULL);

-- คำเชิญที่รอตอบก็นับเป็นรายการที่ยังมีผล (1 คนมีได้รายการเดียวต่อชมรม) จึงสร้าง unique index ใหม่
DROP INDEX club_memberships_current_key;
CREATE UNIQUE INDEX club_memberships_current_key
  ON club_memberships (club_id, user_id) WHERE status IN ('pending', 'active', 'invited');
-- "คำเชิญของฉัน"
CREATE INDEX club_memberships_invited_user_idx ON club_memberships (user_id) WHERE status = 'invited';

ALTER TABLE club_membership_events DROP CONSTRAINT club_membership_events_action_check;
ALTER TABLE club_membership_events ADD CONSTRAINT club_membership_events_action_check
  CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed', 'resign_requested', 'resign_cancelled',
                    'deleted', 'restored', 'invited', 'invite_accepted', 'invite_declined', 'invite_cancelled'));

-- Down Migration
-- คำเชิญที่รอตอบ/ปฏิเสธ เทียบเท่าใบสมัครที่ยกเลิกในโครงสร้างเดิม และลบ event ใหม่ (trigger ห้ามลบ → ปิดชั่วคราว)
UPDATE club_memberships SET status = 'withdrawn' WHERE status IN ('invited', 'declined');
ALTER TABLE club_membership_events DISABLE TRIGGER club_membership_events_immutable;
DELETE FROM club_membership_events WHERE action IN ('invited', 'invite_accepted', 'invite_declined', 'invite_cancelled');
ALTER TABLE club_membership_events ENABLE TRIGGER club_membership_events_immutable;
ALTER TABLE club_membership_events DROP CONSTRAINT club_membership_events_action_check;
ALTER TABLE club_membership_events ADD CONSTRAINT club_membership_events_action_check
  CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed', 'resign_requested', 'resign_cancelled', 'deleted', 'restored'));
DROP INDEX IF EXISTS club_memberships_invited_user_idx;
DROP INDEX club_memberships_current_key;
CREATE UNIQUE INDEX club_memberships_current_key
  ON club_memberships (club_id, user_id) WHERE status IN ('pending', 'active');
ALTER TABLE club_memberships
  DROP CONSTRAINT IF EXISTS club_memberships_invited_consistency,
  DROP COLUMN IF EXISTS invited_by;
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_status_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'ended', 'withdrawn', 'deleted'));
