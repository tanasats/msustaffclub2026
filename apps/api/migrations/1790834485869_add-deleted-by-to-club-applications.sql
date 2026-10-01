-- Up Migration
-- ผู้ยื่นลบคำขอที่ยกเลิกแล้วออกจากรายการ (soft delete ด้วย deleted_at ที่มีอยู่เดิม) — เก็บว่าใครลบ
-- คอลัมน์ใหม่เป็น nullable จึงไม่กระทบแถวเดิม (ยังไม่มีแถวใดถูกลบ)
ALTER TABLE club_applications
  ADD COLUMN deleted_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  -- ลบได้เฉพาะคำขอที่ยกเลิกแล้ว (กันข้อมูลผิดจากช่องทางอื่น)
  ADD CONSTRAINT club_applications_deleted_only_cancelled CHECK (deleted_at IS NULL OR status = 'cancelled'),
  -- ลบแล้วต้องรู้ว่าใครลบ / ยังไม่ลบต้องไม่มีผู้ลบ
  ADD CONSTRAINT club_applications_deleted_consistency CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

-- รายการ "ลบแล้ว" ของผู้ดูแลระบบ (เรียงล่าสุดก่อน)
CREATE INDEX club_applications_deleted_idx ON club_applications (deleted_at DESC) WHERE deleted_at IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS club_applications_deleted_idx;
ALTER TABLE club_applications
  DROP CONSTRAINT IF EXISTS club_applications_deleted_consistency,
  DROP CONSTRAINT IF EXISTS club_applications_deleted_only_cancelled,
  DROP COLUMN IF EXISTS deleted_by;
