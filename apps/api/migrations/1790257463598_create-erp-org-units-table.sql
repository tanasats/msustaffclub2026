-- Up Migration
-- ตารางจับคู่หน่วยงานของ ERP-HR (รหัส 12 หลัก เช่น 201092704000) กับ org_units (รหัส 2 หลัก)
-- ผูกด้วยรหัส ERP ไม่ใช่ชื่อ เพราะชื่ออาจเปลี่ยน ระบบเพิ่มแถวเองเมื่อเจอรหัสใหม่ตอนบุคลากร login
CREATE TABLE erp_org_units (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  erp_id       text        NOT NULL,
  -- ชื่อล่าสุดที่ ERP ส่งมา
  name_th      text        NOT NULL,
  -- NULL = ยังจับคู่ไม่ได้ (รอผู้ดูแลกำหนด)
  org_unit_id  uuid        REFERENCES org_units (id) ON DELETE RESTRICT,
  -- ที่มาของการจับคู่: 'name' = ระบบจับคู่จากชื่อที่ตรงกัน, 'manual' = ผู้ดูแลกำหนดเอง
  match_source text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_org_units_erp_id_key UNIQUE (erp_id),
  CONSTRAINT erp_org_units_match_source_check CHECK (match_source IN ('name', 'manual')),
  -- จับคู่แล้วต้องมีที่มา และยังไม่จับคู่ต้องไม่มีที่มา
  CONSTRAINT erp_org_units_match_consistency CHECK ((org_unit_id IS NULL) = (match_source IS NULL))
);

CREATE INDEX erp_org_units_org_unit_id_idx ON erp_org_units (org_unit_id);

CREATE TRIGGER erp_org_units_set_updated_at
  BEFORE UPDATE ON erp_org_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE erp_org_units;
