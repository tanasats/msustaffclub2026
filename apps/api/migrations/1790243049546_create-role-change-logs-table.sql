-- Up Migration
-- บันทึกการให้/ถอน role ทุกครั้ง เป็น log แบบเขียนได้อย่างเดียว (ไม่มี updated_at เพราะห้ามแก้ไข)
CREATE TABLE role_change_logs (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  -- NULL = ระบบเป็นผู้ทำ (login ครั้งแรก หรือ seed script)
  actor_user_id  uuid        REFERENCES users (id) ON DELETE RESTRICT,
  target_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role_id        uuid        NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  action         text        NOT NULL,
  reason         text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_change_logs_action_check CHECK (action IN ('grant', 'revoke')),
  CONSTRAINT role_change_logs_reason_not_blank CHECK (btrim(reason) <> '')
);

-- ดูประวัติของผู้ใช้คนหนึ่งเรียงจากล่าสุด
CREATE INDEX role_change_logs_target_user_id_created_at_idx ON role_change_logs (target_user_id, created_at DESC);
-- ดูว่าผู้ดูแลคนหนึ่งเคยให้/ถอนอะไรไปบ้าง
CREATE INDEX role_change_logs_actor_user_id_idx ON role_change_logs (actor_user_id);
CREATE INDEX role_change_logs_role_id_idx ON role_change_logs (role_id);

-- ห้ามแก้หรือลบ log ที่ระดับฐานข้อมูล (กันทั้งจากโค้ดและจากคนที่เข้า DB ตรง ๆ)
CREATE FUNCTION prevent_role_change_log_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'role_change_logs ห้ามแก้ไขหรือลบ' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER role_change_logs_immutable
  BEFORE UPDATE OR DELETE ON role_change_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change_log_modification();

-- Down Migration
DROP TABLE role_change_logs;
DROP FUNCTION prevent_role_change_log_modification();
