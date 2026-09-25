-- Up Migration
-- ผลงานของสมาชิกในนามชมรม (ใช้กับทุกประเภทชมรม ไม่ผูกกับกีฬา)
-- เจ้าของบันทึกเอง → รอรับรอง → กรรมการชมรมรับรอง / ส่งกลับแก้ไข / ไม่รับรอง
CREATE TABLE club_achievements (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id       uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  -- เจ้าของผลงาน (1 ผลงาน 1 เจ้าของ ผลงานทีมให้แต่ละคนบันทึก)
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title         text        NOT NULL,
  achieved_on   date        NOT NULL,
  level         text        NOT NULL,
  category      text        NOT NULL,
  -- ผลที่ได้รับ เช่น "รางวัลชนะเลิศ" และผู้จัด/หน่วยงานที่มอบ (ไม่บังคับ)
  award         text,
  organizer     text,
  description   text,
  status        text        NOT NULL DEFAULT 'pending',
  -- ผู้ตัดสินล่าสุด (รับรอง/ส่งกลับ/ไม่รับรอง) — ประวัติทั้งหมดอยู่ที่ club_achievement_events
  decided_by    uuid        REFERENCES users (id) ON DELETE RESTRICT,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_achievements_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT club_achievements_level_check
    CHECK (level IN ('international', 'national', 'regional', 'provincial', 'university', 'club')),
  CONSTRAINT club_achievements_category_check
    CHECK (category IN ('competition', 'performance', 'academic', 'community_service', 'other')),
  CONSTRAINT club_achievements_status_check
    CHECK (status IN ('pending', 'approved', 'returned', 'rejected', 'withdrawn')),
  -- รับรอง/ไม่รับรอง/ส่งกลับ ต้องมีผู้ตัดสินและเวลา
  CONSTRAINT club_achievements_decision_consistency
    CHECK (status NOT IN ('approved', 'returned', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

-- ผลงานที่รับรองแล้วของชมรม (ล่าสุดก่อน) สำหรับหน้าชมรม
CREATE INDEX club_achievements_club_approved_idx ON club_achievements (club_id, achieved_on DESC) WHERE status = 'approved';
-- คิวรอรับรองของชมรม (partial index เล็ก เก็บเฉพาะที่รอ)
CREATE INDEX club_achievements_club_pending_idx ON club_achievements (club_id, created_at) WHERE status = 'pending';
-- ผลงานของฉัน
CREATE INDEX club_achievements_user_id_idx ON club_achievements (user_id, created_at DESC);
CREATE INDEX club_achievements_decided_by_idx ON club_achievements (decided_by) WHERE decided_by IS NOT NULL;

CREATE TRIGGER club_achievements_set_updated_at
  BEFORE UPDATE ON club_achievements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_achievements;
