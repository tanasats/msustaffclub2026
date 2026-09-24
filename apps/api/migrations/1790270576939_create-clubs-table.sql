-- Up Migration
-- ชมรมที่ได้รับอนุมัติแล้ว (ข้อมูลระหว่างยื่นคำขออยู่ใน club_applications)
CREATE TABLE clubs (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  name_th          text        NOT NULL,
  category_id      uuid        NOT NULL REFERENCES club_categories (id) ON DELETE RESTRICT,
  -- รายละเอียดประเภท (บังคับเมื่อประเภท requires_detail ตรวจที่ service)
  category_detail  text,
  status           text        NOT NULL DEFAULT 'active',
  motto            text,
  logo_meaning     text,
  history          text,
  objectives       text[]      NOT NULL DEFAULT '{}',
  office_location  text,
  contact_phone    text,
  contact_email    text,
  regulation_text  text,
  established_on   date        NOT NULL,
  -- ทะเบียนมีผลถึงวันนี้ (30 ก.ย. ของปีงบประมาณ) ต้องต่อทะเบียนทุกปี
  registered_until date        NOT NULL,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clubs_name_th_not_blank CHECK (btrim(name_th) <> ''),
  CONSTRAINT clubs_status_check CHECK (status IN ('active', 'suspended', 'dissolved'))
);

-- ชื่อชมรมห้ามซ้ำกับชมรมที่ยังไม่ถูกยุบ/ลบ
-- เทียบแบบไม่สนตัวพิมพ์และช่องว่างซ้อน (expression index + partial index)
CREATE UNIQUE INDEX clubs_name_th_active_key
  ON clubs (lower(regexp_replace(btrim(name_th), '\s+', ' ', 'g')))
  WHERE deleted_at IS NULL AND status <> 'dissolved';

CREATE INDEX clubs_category_id_idx ON clubs (category_id);

CREATE TRIGGER clubs_set_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE clubs;
