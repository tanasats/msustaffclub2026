-- Up Migration
-- เพิ่มวัตถุประสงค์ไฟล์ "รูปกิจกรรม" (ขยายรายการที่อนุญาต ข้อมูลเดิมยังผ่านทั้งหมด)
ALTER TABLE files DROP CONSTRAINT files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check
  CHECK (purpose IN ('advisor_consent', 'club_logo', 'achievement_evidence', 'activity_photo'));

-- Down Migration
-- ถ้ามีรูปกิจกรรมอยู่แล้ว ห้ามย้อน (ไม่ลบข้อมูลไฟล์ทิ้งเงียบ ๆ)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM files WHERE purpose = 'activity_photo') THEN
    RAISE EXCEPTION 'มีรูปกิจกรรมอยู่ในตาราง files ต้องจัดการก่อนย้อน migration นี้';
  END IF;
END $$;
ALTER TABLE files DROP CONSTRAINT files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check
  CHECK (purpose IN ('advisor_consent', 'club_logo', 'achievement_evidence'));
