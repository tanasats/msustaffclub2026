-- Up Migration
-- ประวัติการเข้าระบบ (login สำเร็จ 1 แถวต่อครั้ง) ให้ผู้ดูแลระบบตรวจปัญหาบัญชี — ไม่เก็บ IP/User-Agent (PDPA: เก็บเท่าที่จำเป็น)
-- erp_result = ผลการดึงข้อมูลบุคลากรจาก ERP-HR ในการ login ครั้งนั้น (NULL = ไม่ได้เรียก เช่น บัญชีนิสิต)
-- เก็บ 180 วันแล้วลบอัตโนมัติ (งานตามรอบ) — ห้ามแก้ไขแถว (ลบได้เฉพาะตามระยะเก็บ)
CREATE TABLE login_events (
  id         uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  erp_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT login_events_erp_result_check CHECK (erp_result IN ('ok', 'not_found', 'error'))
);

-- ประวัติของผู้ใช้ใหม่สุดก่อน / ผลการดึง ERP ล่าสุด
CREATE INDEX login_events_user_id_created_at_idx ON login_events (user_id, created_at DESC);
-- ลบรายการเก่าตามรอบ
CREATE INDEX login_events_created_at_idx ON login_events (created_at);

CREATE TRIGGER login_events_set_updated_at
  BEFORE UPDATE ON login_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER login_events_immutable
  BEFORE UPDATE ON login_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE login_events;
