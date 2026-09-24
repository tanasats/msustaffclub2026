-- Up Migration
-- id ใช้ uuidv7() (มีใน PostgreSQL 18) เรียงตามเวลาสร้าง จึงทำ index ได้ดีกว่า uuid แบบสุ่ม
CREATE TABLE roles (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  code          text        NOT NULL,
  name_th       text        NOT NULL,
  description   text,
  is_system     boolean     NOT NULL DEFAULT false,
  is_privileged boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_code_key UNIQUE (code),
  CONSTRAINT roles_code_format CHECK (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  CONSTRAINT roles_name_th_not_blank CHECK (btrim(name_th) <> '')
);

CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ป้องกันที่ระดับฐานข้อมูล: role ระบบ (is_system) ห้ามลบ และห้ามเปลี่ยน code / is_system
-- ยกเว้นตั้งค่า app.allow_system_role_change = 'on' ใน transaction (ใช้เฉพาะ migration down)
CREATE FUNCTION protect_system_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_system_role_change', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'ห้ามลบ role ระบบ (%)', OLD.code USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_system
     AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.is_system IS DISTINCT FROM OLD.is_system) THEN
    RAISE EXCEPTION 'ห้ามเปลี่ยน code หรือ is_system ของ role ระบบ (%)', OLD.code USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER roles_protect_system
  BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION protect_system_roles();

-- Down Migration
DROP TABLE roles;
DROP FUNCTION protect_system_roles();
