-- Up Migration
-- สมาชิกยื่นลาออก → กรรมการรับทราบ (ปฏิเสธไม่ได้ ตามระเบียบข้อ 20(3)) หรือมีผลอัตโนมัติเมื่อครบ 30 วัน
-- เพิ่มคอลัมน์ nullable และขยายค่า action ที่ยอมรับ ข้อมูลเดิมไม่เปลี่ยน
ALTER TABLE club_memberships
  ADD COLUMN resign_requested_at timestamptz,
  ADD COLUMN resign_note         text,
  -- ยื่นลาออกได้เฉพาะสมาชิก active และต้องมีเหตุผล (เมื่อพ้นสภาพแล้วล้างค่าในคำสั่งเดียวกัน — ประวัติอยู่ใน events)
  ADD CONSTRAINT club_memberships_resign_consistency CHECK (
    (resign_requested_at IS NULL AND resign_note IS NULL)
    OR (resign_requested_at IS NOT NULL AND resign_note IS NOT NULL AND status = 'active')
  );

-- งานอัตโนมัติ: หาคำขอลาออกที่ครบกำหนด
CREATE INDEX club_memberships_resign_requested_idx ON club_memberships (resign_requested_at) WHERE resign_requested_at IS NOT NULL;

ALTER TABLE club_membership_events DROP CONSTRAINT club_membership_events_action_check;
ALTER TABLE club_membership_events ADD CONSTRAINT club_membership_events_action_check
  CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed', 'resign_requested', 'resign_cancelled'));

-- Down Migration
-- event ใหม่ยังไม่มีในโครงสร้างเดิม จึงลบทิ้ง (trigger ห้ามลบ → ปิดชั่วคราวเฉพาะตอน down)
ALTER TABLE club_membership_events DISABLE TRIGGER club_membership_events_immutable;
DELETE FROM club_membership_events WHERE action IN ('resign_requested', 'resign_cancelled');
ALTER TABLE club_membership_events ENABLE TRIGGER club_membership_events_immutable;
ALTER TABLE club_membership_events DROP CONSTRAINT club_membership_events_action_check;
ALTER TABLE club_membership_events ADD CONSTRAINT club_membership_events_action_check
  CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed'));
DROP INDEX IF EXISTS club_memberships_resign_requested_idx;
ALTER TABLE club_memberships
  DROP CONSTRAINT IF EXISTS club_memberships_resign_consistency,
  DROP COLUMN IF EXISTS resign_note,
  DROP COLUMN IF EXISTS resign_requested_at;
