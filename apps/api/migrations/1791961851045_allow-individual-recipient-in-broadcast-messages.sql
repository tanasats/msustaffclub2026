-- Up Migration
-- ประกาศสโมสรส่งถึงบุคลากรรายบุคคลได้ (1 คนต่อครั้ง ผู้ใช้ยืนยันแล้ว): audience = 'individual' + recipient_user_id
-- เพิ่มอย่างเดียว ข้อมูลเดิมไม่เปลี่ยน (แถวเดิม recipient_user_id = NULL ผ่าน CHECK ใหม่)
ALTER TABLE broadcast_messages ADD COLUMN recipient_user_id uuid REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE broadcast_messages DROP CONSTRAINT broadcast_messages_audience_check;
ALTER TABLE broadcast_messages ADD CONSTRAINT broadcast_messages_audience_check CHECK (
  (kind = 'staff_announcement' AND club_id IS NULL AND audience IN ('all_staff', 'club_committees', 'club_members', 'org_units', 'individual'))
  OR (kind = 'club_message' AND club_id IS NOT NULL AND audience = 'club')
);
-- ผู้รับรายบุคคลต้องระบุผู้ใช้ และกลุ่มอื่นต้องไม่ระบุ
ALTER TABLE broadcast_messages ADD CONSTRAINT broadcast_messages_individual_check CHECK ((audience = 'individual') = (recipient_user_id IS NOT NULL));

CREATE INDEX broadcast_messages_recipient_user_id_idx ON broadcast_messages (recipient_user_id) WHERE recipient_user_id IS NOT NULL;

-- Down Migration
-- ย้อนกลับ (dev เท่านั้น): ต้องลบข้อความรายบุคคลก่อนคืน CHECK เดิม — ตารางห้ามลบแถว จึงปิด trigger ชั่วคราวใน migration นี้
ALTER TABLE broadcast_messages DISABLE TRIGGER broadcast_messages_immutable;
DELETE FROM broadcast_messages WHERE audience = 'individual';
ALTER TABLE broadcast_messages ENABLE TRIGGER broadcast_messages_immutable;
DROP INDEX broadcast_messages_recipient_user_id_idx;
ALTER TABLE broadcast_messages DROP CONSTRAINT broadcast_messages_individual_check;
ALTER TABLE broadcast_messages DROP CONSTRAINT broadcast_messages_audience_check;
ALTER TABLE broadcast_messages ADD CONSTRAINT broadcast_messages_audience_check CHECK (
  (kind = 'staff_announcement' AND club_id IS NULL AND audience IN ('all_staff', 'club_committees', 'club_members', 'org_units'))
  OR (kind = 'club_message' AND club_id IS NOT NULL AND audience = 'club')
);
ALTER TABLE broadcast_messages DROP COLUMN recipient_user_id;
