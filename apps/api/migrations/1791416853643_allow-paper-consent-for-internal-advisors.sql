-- Up Migration
-- ที่ปรึกษาบุคลากรที่ไม่สะดวกเข้าระบบ ยินยอมด้วยใบคำยินยอมที่ลงนามแล้ว (เหมือนบุคคลภายนอก) แล้วเจ้าหน้าที่ยืนยันเอกสาร
-- เดิมไฟล์คำยินยอมใช้ได้เฉพาะบุคคลภายนอก → ยกเลิกข้อจำกัดนี้ (ข้อมูลเดิมไม่กระทบ)
ALTER TABLE club_application_advisors DROP CONSTRAINT club_application_advisors_consent_file_external_only;
-- มีไฟล์คำยินยอม = ยินยอมแล้ว
ALTER TABLE club_application_advisors ADD CONSTRAINT club_application_advisors_consent_file_accepted
  CHECK (consent_file_id IS NULL OR consent_status = 'accepted');

-- Down Migration
-- ย้อนได้เฉพาะเมื่อไม่มีที่ปรึกษาบุคลากรที่แนบไฟล์ (ถ้ามี ADD CONSTRAINT จะล้ม — ตั้งใจ ไม่ลบไฟล์เอง)
ALTER TABLE club_application_advisors DROP CONSTRAINT IF EXISTS club_application_advisors_consent_file_accepted;
ALTER TABLE club_application_advisors ADD CONSTRAINT club_application_advisors_consent_file_external_only
  CHECK (consent_file_id IS NULL OR external_person_id IS NOT NULL);
