-- Up Migration
-- ประเภทชมรมตามแบบฟอร์มสโมสรบุคลากร (หน้า 15) — ชมรมหนึ่งเลือกได้ 1 ประเภท
CREATE TABLE club_categories (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  code            text        NOT NULL,
  name_th         text        NOT NULL,
  -- true = ต้องระบุรายละเอียดเพิ่ม (ด้านอื่น ๆ)
  requires_detail boolean     NOT NULL DEFAULT false,
  sort_order      integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_categories_code_key UNIQUE (code),
  CONSTRAINT club_categories_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT club_categories_name_th_not_blank CHECK (btrim(name_th) <> '')
);

CREATE TRIGGER club_categories_set_updated_at
  BEFORE UPDATE ON club_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_categories;
