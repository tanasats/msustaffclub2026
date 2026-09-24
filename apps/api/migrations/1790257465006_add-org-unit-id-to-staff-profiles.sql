-- Up Migration
-- หน่วยงานของบุคลากรใน org_units (ระดับละเอียดสุดที่จับคู่ได้: กอง/ฝ่าย ก่อน แล้วค่อยคณะ/สำนัก)
-- เป็น NULL ได้ (ยังจับคู่ไม่ได้) แถวเดิมจะถูกเติมค่าเมื่อบุคลากร login ครั้งถัดไป
ALTER TABLE staff_profiles
  ADD COLUMN org_unit_id uuid REFERENCES org_units (id) ON DELETE RESTRICT;

CREATE INDEX staff_profiles_org_unit_id_idx ON staff_profiles (org_unit_id);

-- Down Migration
DROP INDEX staff_profiles_org_unit_id_idx;
ALTER TABLE staff_profiles DROP COLUMN org_unit_id;
