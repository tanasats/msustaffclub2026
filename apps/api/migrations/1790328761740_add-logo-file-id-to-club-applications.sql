-- Up Migration
-- รูปตราสัญลักษณ์ที่แนบมากับคำขอ (ไม่บังคับ) เมื่ออนุมัติจะคัดลอกไปที่ clubs.logo_file_id
ALTER TABLE club_applications ADD COLUMN logo_file_id uuid REFERENCES files (id) ON DELETE RESTRICT;

-- index สำหรับตรวจว่าไฟล์ยังถูกใช้อยู่หรือไม่ก่อนลบ (partial: เก็บเฉพาะแถวที่มีตรา)
CREATE INDEX club_applications_logo_file_id_idx ON club_applications (logo_file_id) WHERE logo_file_id IS NOT NULL;

-- Down Migration
ALTER TABLE club_applications DROP COLUMN logo_file_id;
