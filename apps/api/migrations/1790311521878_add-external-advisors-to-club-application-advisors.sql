-- Up Migration
-- ที่ปรึกษาในคำขอ = บุคลากร (email/user_id, ยินยอมผ่าน login) หรือ บุคคลภายนอก (external_person_id, ยินยอมด้วยไฟล์เอกสาร)
-- แถวเดิมทั้งหมดเป็นบุคลากร (มี email) จึงผ่าน constraint ใหม่โดยไม่ต้องแก้ข้อมูล
ALTER TABLE club_application_advisors
  ALTER COLUMN email DROP NOT NULL,
  ADD COLUMN external_person_id  uuid REFERENCES external_persons (id) ON DELETE RESTRICT,
  -- ใบคำยินยอมที่ลงนามแล้ว (เฉพาะบุคคลภายนอก)
  ADD COLUMN consent_file_id     uuid REFERENCES files (id) ON DELETE RESTRICT,
  -- เจ้าหน้าที่สโมสรที่ตรวจเอกสารคำยินยอมแล้ว
  ADD COLUMN consent_verified_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN consent_verified_at timestamptz,
  -- เป็นบุคลากรหรือบุคคลภายนอก อย่างใดอย่างหนึ่งเท่านั้น
  ADD CONSTRAINT club_application_advisors_kind_check CHECK (
    (email IS NOT NULL AND external_person_id IS NULL)
    OR (email IS NULL AND user_id IS NULL AND external_person_id IS NOT NULL)
  ),
  ADD CONSTRAINT club_application_advisors_consent_file_external_only CHECK (consent_file_id IS NULL OR external_person_id IS NOT NULL),
  ADD CONSTRAINT club_application_advisors_verified_consistency CHECK (
    (consent_verified_by IS NULL) = (consent_verified_at IS NULL)
    AND (consent_verified_at IS NULL OR consent_file_id IS NOT NULL)
  ),
  ADD CONSTRAINT club_application_advisors_external_person_key UNIQUE (application_id, external_person_id);

-- หา "คำขอที่ใช้ไฟล์นี้" ตอนตรวจสิทธิ์ดาวน์โหลดใบคำยินยอม
CREATE INDEX club_application_advisors_consent_file_id_idx ON club_application_advisors (consent_file_id);
CREATE INDEX club_application_advisors_external_person_id_idx ON club_application_advisors (external_person_id);

-- Down Migration
-- ย้อนฟีเจอร์ที่ปรึกษาภายนอก: ต้องลบแถวที่ปรึกษาภายนอกก่อน จึงคืน NOT NULL ของ email ได้
DELETE FROM club_application_advisors WHERE external_person_id IS NOT NULL;
DROP INDEX club_application_advisors_external_person_id_idx;
DROP INDEX club_application_advisors_consent_file_id_idx;
ALTER TABLE club_application_advisors
  DROP CONSTRAINT club_application_advisors_external_person_key,
  DROP CONSTRAINT club_application_advisors_verified_consistency,
  DROP CONSTRAINT club_application_advisors_consent_file_external_only,
  DROP CONSTRAINT club_application_advisors_kind_check,
  DROP COLUMN consent_verified_at,
  DROP COLUMN consent_verified_by,
  DROP COLUMN consent_file_id,
  DROP COLUMN external_person_id,
  ALTER COLUMN email SET NOT NULL;
