-- Up Migration
-- permission รูปแบบ resource:action เช่น user_role:assign (ตรวจรูปแบบด้วย CHECK)
CREATE TABLE permissions (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  code           text        NOT NULL,
  description_th text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_code_key UNIQUE (code),
  CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$')
);

CREATE TRIGGER permissions_set_updated_at
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE permissions;
