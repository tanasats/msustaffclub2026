-- Up Migration
-- การตอบรับของกรรมการในคำขอ (ใช้กับประธานที่ผู้ยื่นเสนอชื่อ ซึ่งไม่ใช่ผู้ยื่นเอง)
-- NULL = ไม่ต้องตอบรับ (เช่น ผู้ยื่นเป็นประธานเอง) จึงเพิ่มแบบ nullable ไม่กระทบแถวเดิม
ALTER TABLE club_application_committee
  ADD COLUMN consent_status text,
  ADD COLUMN responded_at   timestamptz,
  ADD CONSTRAINT club_application_committee_consent_status_check
    CHECK (consent_status IN ('pending', 'accepted', 'declined')),
  -- ตอบแล้ว (accepted/declined) ต้องมีเวลาตอบ, ยังไม่ตอบหรือไม่ต้องตอบต้องไม่มี
  ADD CONSTRAINT club_application_committee_responded_consistency
    CHECK ((COALESCE(consent_status, 'pending') <> 'pending') = (responded_at IS NOT NULL));

-- ค้นหาคำเสนอชื่อที่รอผู้ใช้ตอบ (แบนเนอร์/เมนู)
CREATE INDEX club_application_committee_pending_user_idx
  ON club_application_committee (user_id) WHERE consent_status = 'pending';

-- Down Migration
DROP INDEX IF EXISTS club_application_committee_pending_user_idx;
ALTER TABLE club_application_committee
  DROP CONSTRAINT IF EXISTS club_application_committee_responded_consistency,
  DROP CONSTRAINT IF EXISTS club_application_committee_consent_status_check,
  DROP COLUMN IF EXISTS responded_at,
  DROP COLUMN IF EXISTS consent_status;
