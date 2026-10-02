-- Up Migration
-- ประวัติการปิด/เปิดบัญชีผู้ใช้ (เช่น พ้นจากมหาวิทยาลัย) ใครทำ กับใคร เพราะอะไร และผลที่เกิด — แก้/ลบไม่ได้
CREATE TABLE user_account_events (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  actor_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action        text        NOT NULL,
  reason        text        NOT NULL,
  -- จำนวนรายการที่ระบบเปลี่ยนตาม (สมาชิกภาพ/ตำแหน่งกรรมการ/ที่ปรึกษา) ไม่เก็บข้อมูลส่วนบุคคลเพิ่ม
  effects       jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_account_events_action_check CHECK (action IN ('deactivated', 'reactivated')),
  CONSTRAINT user_account_events_reason_not_blank CHECK (btrim(reason) <> '')
);

CREATE INDEX user_account_events_user_id_idx ON user_account_events (user_id, created_at DESC);
CREATE INDEX user_account_events_actor_user_id_idx ON user_account_events (actor_user_id);

CREATE TRIGGER user_account_events_set_updated_at
  BEFORE UPDATE ON user_account_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_account_events_immutable
  BEFORE UPDATE OR DELETE ON user_account_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE user_account_events;
