-- Up Migration
-- ฟังก์ชัน trigger กลาง: ตั้ง updated_at = now() ให้อัตโนมัติทุกครั้งที่มีการ UPDATE แถว
-- (ไม่ต้องพึ่งให้โค้ดฝั่งแอปจำใส่เอง)
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Down Migration
DROP FUNCTION set_updated_at();
