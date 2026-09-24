-- Up Migration
-- ฟังก์ชัน trigger กลางสำหรับตาราง log ที่ห้ามแก้/ลบ (ผูกกับ BEFORE UPDATE OR DELETE)
CREATE FUNCTION prevent_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ตาราง % ห้ามแก้ไขหรือลบ', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

-- Down Migration
DROP FUNCTION prevent_modification();
