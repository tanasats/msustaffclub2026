-- Up Migration
-- เพิ่มสถานะ withdrawn = ผู้สมัครยกเลิกใบสมัครเอง (เก็บแถวไว้เป็นประวัติแทนการลบ)
-- เป็นการเพิ่มค่าที่ยอมรับใน CHECK เท่านั้น ข้อมูลเดิมไม่เปลี่ยน
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_status_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'ended', 'withdrawn'));

-- Down Migration
-- แถวที่ยกเลิกใบสมัครแล้วเทียบเท่าการถูกปฏิเสธในโครงสร้างเดิม
UPDATE club_memberships SET status = 'rejected' WHERE status = 'withdrawn';
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_status_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'ended'));
