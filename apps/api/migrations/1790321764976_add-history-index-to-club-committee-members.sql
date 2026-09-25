-- Up Migration
-- ประวัติกรรมการที่พ้นตำแหน่งแล้วของแต่ละชมรม (ล่าสุดก่อน)
-- partial index เฉพาะแถวที่สิ้นสุดแล้ว คู่กับ club_committee_members_current_idx ที่เก็บเฉพาะแถวปัจจุบัน
CREATE INDEX club_committee_members_history_idx
  ON club_committee_members (club_id, ended_on DESC)
  WHERE ended_on IS NOT NULL;

-- Down Migration
DROP INDEX club_committee_members_history_idx;
