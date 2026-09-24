-- Up Migration
-- คำขอจัดตั้ง/ต่อทะเบียนชมรม (ข้อมูลตามแบบฟอร์มสโมสร แก้ได้จนกว่าจะอนุมัติ)
-- ฉบับร่างอาจยังกรอกไม่ครบ จึงให้หลายคอลัมน์เป็น NULL ได้ ความครบถ้วนตรวจที่ service ตอนยื่น
CREATE TABLE club_applications (
  id                uuid        PRIMARY KEY DEFAULT uuidv7(),
  type              text        NOT NULL,
  -- ชมรมที่ต่อทะเบียน หรือชมรมที่ถูกสร้างเมื่อคำขอจัดตั้งได้รับอนุมัติ
  club_id           uuid        REFERENCES clubs (id) ON DELETE RESTRICT,
  fiscal_year       integer     NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  applicant_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name_th           text        NOT NULL,
  category_id       uuid        REFERENCES club_categories (id) ON DELETE RESTRICT,
  category_detail   text,
  history           text,
  motto             text,
  logo_meaning      text,
  objectives        text[]      NOT NULL DEFAULT '{}',
  office_location   text,
  contact_phone     text,
  contact_email     text,
  regulation_text   text,
  submitted_at      timestamptz,
  reviewed_by       uuid        REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at       timestamptz,
  decided_by        uuid        REFERENCES users (id) ON DELETE RESTRICT,
  decided_at        timestamptz,
  decision_note     text,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_applications_type_check CHECK (type IN ('establish', 'renewal')),
  -- ต่อทะเบียนต้องระบุชมรมเสมอ, จัดตั้งใหม่ได้ club_id เมื่ออนุมัติแล้ว (ชมรมที่ถูกสร้างจากคำขอนี้)
  CONSTRAINT club_applications_renewal_has_club CHECK (type = 'establish' OR club_id IS NOT NULL),
  CONSTRAINT club_applications_approved_has_club CHECK (status <> 'approved' OR club_id IS NOT NULL),
  CONSTRAINT club_applications_status_check CHECK (
    status IN ('draft', 'awaiting_consent', 'submitted', 'returned', 'reviewed', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT club_applications_fiscal_year_range CHECK (fiscal_year BETWEEN 2500 AND 2700),
  CONSTRAINT club_applications_name_th_not_blank CHECK (btrim(name_th) <> '')
);

-- "คำขอของฉัน"
CREATE INDEX club_applications_applicant_user_id_idx ON club_applications (applicant_user_id) WHERE deleted_at IS NULL;
-- กล่องงานของเจ้าหน้าที่/นายกสโมสร (กรองตามสถานะ)
CREATE INDEX club_applications_status_idx ON club_applications (status) WHERE deleted_at IS NULL;
CREATE INDEX club_applications_club_id_idx ON club_applications (club_id);

CREATE TRIGGER club_applications_set_updated_at
  BEFORE UPDATE ON club_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_applications;
