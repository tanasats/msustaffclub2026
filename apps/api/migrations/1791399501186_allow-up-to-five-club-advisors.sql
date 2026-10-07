-- Up Migration
-- ที่ปรึกษาชมรมได้ไม่เกิน 5 คน (เดิม 2) — ขยายช่วงที่ยอมรับเท่านั้น ข้อมูลเดิม (ลำดับ 1–2) ผ่านเงื่อนไขใหม่ทั้งหมด
ALTER TABLE club_application_advisors DROP CONSTRAINT club_application_advisors_sort_order_range;
ALTER TABLE club_application_advisors ADD CONSTRAINT club_application_advisors_sort_order_range CHECK (sort_order BETWEEN 1 AND 5);

-- ตำแหน่งที่ปรึกษาในข้อมูลหลัก (ใช้แสดง/ตรวจจำนวนต่อชมรม) ให้ตรงกัน
UPDATE club_positions SET max_per_club = 5 WHERE code = 'advisor';

-- Down Migration
-- ย้อนได้เฉพาะเมื่อยังไม่มีคำขอที่มีที่ปรึกษาเกิน 2 คน (ถ้ามี คำสั่ง ADD CONSTRAINT จะล้มและ rollback ทั้งหมด — ตั้งใจ ไม่ลบข้อมูลเอง)
UPDATE club_positions SET max_per_club = 2 WHERE code = 'advisor';
ALTER TABLE club_application_advisors DROP CONSTRAINT club_application_advisors_sort_order_range;
ALTER TABLE club_application_advisors ADD CONSTRAINT club_application_advisors_sort_order_range CHECK (sort_order BETWEEN 1 AND 2);
