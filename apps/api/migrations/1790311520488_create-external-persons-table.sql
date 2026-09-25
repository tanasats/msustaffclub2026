-- Up Migration
-- บุคคลภายนอก (ไม่มีบัญชีในระบบ) เช่น ที่ปรึกษาชมรม โค้ช วิทยากร — ตารางกลางใช้ซ้ำได้ทุกบทบาท
-- เก็บข้อมูลติดต่อเท่าที่จำเป็น (PDPA) ต้องมีอีเมลหรือเบอร์โทรอย่างน้อย 1 ช่องทาง
CREATE TABLE external_persons (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  prefix_th     text,
  first_name_th text        NOT NULL,
  last_name_th  text        NOT NULL,
  organization  text        NOT NULL,
  position      text,
  email         text,
  phone         text,
  created_by    uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_persons_name_not_blank CHECK (btrim(first_name_th) <> '' AND btrim(last_name_th) <> ''),
  CONSTRAINT external_persons_organization_not_blank CHECK (btrim(organization) <> ''),
  CONSTRAINT external_persons_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT external_persons_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX external_persons_created_by_idx ON external_persons (created_by);

CREATE TRIGGER external_persons_set_updated_at
  BEFORE UPDATE ON external_persons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE external_persons;
