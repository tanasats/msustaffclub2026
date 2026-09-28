-- Up Migration
-- หลักฐานการแจ้งประกาศความเป็นส่วนตัวของระบบ (PDPA มาตรา 23): ผู้ใช้กด "รับทราบ" ประกาศเวอร์ชันใด เมื่อไร
-- การรับทราบไม่ใช่ความยินยอม (ฐานการประมวลผลหลักคือประโยชน์โดยชอบด้วยกฎหมาย ดู docs/design/pdpa.md)
-- ประกาศเปลี่ยนสาระสำคัญ = เวอร์ชันใหม่ = ผู้ใช้ทุกคนต้องรับทราบอีกครั้ง; บันทึกนี้ห้ามแก้/ลบ (ใช้เป็นหลักฐาน)
CREATE TABLE privacy_notice_acknowledgements (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  notice_version   text        NOT NULL,
  acknowledged_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_notice_acknowledgements_user_version_key UNIQUE (user_id, notice_version),
  CONSTRAINT privacy_notice_acknowledgements_version_not_blank CHECK (btrim(notice_version) <> '')
);

CREATE TRIGGER privacy_notice_acknowledgements_set_updated_at
  BEFORE UPDATE ON privacy_notice_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- บันทึกหลักฐาน: ห้ามแก้ไขหรือลบ (ใช้ trigger เดียวกับ log อื่นของระบบ)
CREATE TRIGGER privacy_notice_acknowledgements_immutable
  BEFORE UPDATE OR DELETE ON privacy_notice_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE privacy_notice_acknowledgements;
