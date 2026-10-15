-- Up Migration
-- ประวัติการแก้สิทธิ์ในระบบโดยผู้ดูแล (ผูก/ถอนสิทธิ์ของ role, สิทธิ์ตามตำแหน่งในชมรม, สร้าง/แก้ role) — แก้/ลบไม่ได้
CREATE TABLE permission_change_logs (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  actor_user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action             text        NOT NULL,
  role_id            uuid        REFERENCES roles (id) ON DELETE RESTRICT,
  permission_id      uuid        REFERENCES permissions (id) ON DELETE RESTRICT,
  club_position_id   uuid        REFERENCES club_positions (id) ON DELETE RESTRICT,
  club_permission_id uuid        REFERENCES club_permissions (id) ON DELETE RESTRICT,
  reason             text        NOT NULL,
  -- รายละเอียดเพิ่มเติม เช่น ค่าก่อน/หลังแก้ role
  details            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_change_logs_action_check CHECK (
    action IN ('role_grant', 'role_revoke', 'position_grant', 'position_revoke', 'role_create', 'role_update')
  ),
  -- คอลัมน์ที่ต้องมีตามชนิดการแก้
  CONSTRAINT permission_change_logs_target_check CHECK (
    (action IN ('role_grant', 'role_revoke')
      AND role_id IS NOT NULL AND permission_id IS NOT NULL AND club_position_id IS NULL AND club_permission_id IS NULL)
    OR (action IN ('position_grant', 'position_revoke')
      AND role_id IS NULL AND permission_id IS NULL AND club_position_id IS NOT NULL AND club_permission_id IS NOT NULL)
    OR (action IN ('role_create', 'role_update')
      AND role_id IS NOT NULL AND permission_id IS NULL AND club_position_id IS NULL AND club_permission_id IS NULL)
  ),
  CONSTRAINT permission_change_logs_reason_not_blank CHECK (btrim(reason) <> '')
);

CREATE INDEX permission_change_logs_created_at_idx ON permission_change_logs (created_at DESC);
CREATE INDEX permission_change_logs_role_id_idx ON permission_change_logs (role_id) WHERE role_id IS NOT NULL;
CREATE INDEX permission_change_logs_actor_user_id_idx ON permission_change_logs (actor_user_id);

CREATE TRIGGER permission_change_logs_set_updated_at
  BEFORE UPDATE ON permission_change_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER permission_change_logs_immutable
  BEFORE UPDATE OR DELETE ON permission_change_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Down Migration
DROP TABLE permission_change_logs;
