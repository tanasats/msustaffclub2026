-- Up Migration
-- ลบรายชื่อที่บันทึกผิด (soft delete) และให้ผู้ดูแลระบบกู้คืนได้
-- แถวที่ลบได้สถานะ 'deleted' (query เดิมทุกตัวกรองตาม status อยู่แล้ว จึงซ่อนอัตโนมัติ และไม่ชน unique index ของสมาชิกภาพที่ยังมีผล)
-- เก็บสถานะเดิมไว้ใน status_before_delete เพื่อกู้คืน ข้อมูลเดิมไม่เปลี่ยน
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_status_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'ended', 'withdrawn', 'deleted'));

ALTER TABLE club_memberships
  ADD COLUMN deleted_at           timestamptz,
  ADD COLUMN deleted_by           uuid REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN status_before_delete text,
  -- สถานะ deleted ⇔ มีเวลา/ผู้ลบ/สถานะเดิมครบ
  ADD CONSTRAINT club_memberships_deleted_consistency CHECK (
    (status = 'deleted') = (deleted_at IS NOT NULL)
    AND (deleted_at IS NULL) = (deleted_by IS NULL)
    AND (deleted_at IS NULL) = (status_before_delete IS NULL)
  ),
  -- ลบได้เฉพาะใบสมัคร (รอ/ไม่อนุมัติ/ยกเลิก) และสมาชิก active (ที่ยังไม่มีข้อมูลผูก — ตรวจที่ service) ไม่ลบผู้ที่พ้นสภาพแล้ว
  ADD CONSTRAINT club_memberships_status_before_delete_check
    CHECK (status_before_delete IN ('pending', 'active', 'rejected', 'withdrawn'));

-- แท็บ "ลบแล้ว" ของผู้ดูแลระบบ
CREATE INDEX club_memberships_deleted_idx ON club_memberships (club_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;

ALTER TABLE club_membership_events DROP CONSTRAINT club_membership_events_action_check;
ALTER TABLE club_membership_events ADD CONSTRAINT club_membership_events_action_check
  CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed', 'resign_requested', 'resign_cancelled', 'deleted', 'restored'));

-- Down Migration
-- คืนแถวที่ลบเป็นสถานะเดิม และลบ event ใหม่ (trigger ห้ามลบ → ปิดชั่วคราวเฉพาะตอน down)
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_deleted_consistency;
UPDATE club_memberships SET status = status_before_delete WHERE status = 'deleted';
ALTER TABLE club_membership_events DISABLE TRIGGER club_membership_events_immutable;
DELETE FROM club_membership_events WHERE action IN ('deleted', 'restored');
ALTER TABLE club_membership_events ENABLE TRIGGER club_membership_events_immutable;
ALTER TABLE club_membership_events DROP CONSTRAINT club_membership_events_action_check;
ALTER TABLE club_membership_events ADD CONSTRAINT club_membership_events_action_check
  CHECK (action IN ('applied', 'withdrawn', 'approved', 'rejected', 'left', 'removed', 'resign_requested', 'resign_cancelled'));
DROP INDEX IF EXISTS club_memberships_deleted_idx;
ALTER TABLE club_memberships
  DROP CONSTRAINT IF EXISTS club_memberships_status_before_delete_check,
  DROP COLUMN IF EXISTS status_before_delete,
  DROP COLUMN IF EXISTS deleted_by,
  DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_status_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'ended', 'withdrawn'));
