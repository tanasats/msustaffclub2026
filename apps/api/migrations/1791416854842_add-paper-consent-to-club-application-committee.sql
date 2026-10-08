-- Up Migration
-- ผู้ถูกเสนอเป็นประธานที่ไม่สะดวกเข้าระบบ ตอบรับด้วยใบตอบรับที่ลงนามแล้ว แล้วเจ้าหน้าที่ยืนยันเอกสาร
-- คอลัมน์ใหม่เป็น nullable ข้อมูลเดิมไม่กระทบ
ALTER TABLE club_application_committee
  ADD COLUMN consent_file_id     uuid REFERENCES files (id) ON DELETE RESTRICT,
  ADD COLUMN consent_verified_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN consent_verified_at timestamptz,
  -- มีไฟล์ = ตอบรับแล้ว
  ADD CONSTRAINT club_application_committee_consent_file_accepted CHECK (consent_file_id IS NULL OR consent_status = 'accepted'),
  -- ยืนยันเอกสารแล้วต้องมีทั้งผู้ยืนยันและเวลา และต้องมีไฟล์
  ADD CONSTRAINT club_application_committee_verified_consistency CHECK (
    (consent_verified_by IS NULL) = (consent_verified_at IS NULL)
    AND (consent_verified_at IS NULL OR consent_file_id IS NOT NULL)
  );

-- หา "คำขอที่ใช้ไฟล์นี้" ตอนตรวจสิทธิ์ดาวน์โหลด
CREATE INDEX club_application_committee_consent_file_id_idx ON club_application_committee (consent_file_id) WHERE consent_file_id IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS club_application_committee_consent_file_id_idx;
ALTER TABLE club_application_committee
  DROP CONSTRAINT IF EXISTS club_application_committee_verified_consistency,
  DROP CONSTRAINT IF EXISTS club_application_committee_consent_file_accepted,
  DROP COLUMN IF EXISTS consent_verified_at,
  DROP COLUMN IF EXISTS consent_verified_by,
  DROP COLUMN IF EXISTS consent_file_id;
