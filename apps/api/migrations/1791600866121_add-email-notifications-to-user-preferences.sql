-- Up Migration
-- ผู้ใช้เลือกรับ/ไม่รับอีเมลแจ้งเตือนจากระบบเอง (ค่าเริ่มต้น = รับ)
-- ไม่มีแถวใน user_preferences ก็ถือว่ารับ (ตามค่าเริ่มต้นใน service) — การแจ้งเตือนในระบบ (notifications) ยังแสดงเสมอ
ALTER TABLE user_preferences ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;

-- Down Migration
ALTER TABLE user_preferences DROP COLUMN email_notifications;
