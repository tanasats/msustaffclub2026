-- Up Migration
-- สิทธิ์ระดับชมรม (แยกจาก permissions ของระบบ) และการผูกกับตำแหน่งในชมรม
CREATE TABLE club_permissions (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  code           text        NOT NULL,
  description_th text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_permissions_code_key UNIQUE (code),
  CONSTRAINT club_permissions_code_format CHECK (code ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$')
);

CREATE TRIGGER club_permissions_set_updated_at
  BEFORE UPDATE ON club_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE club_position_permissions (
  position_id        uuid        NOT NULL REFERENCES club_positions (id) ON DELETE CASCADE,
  club_permission_id uuid        NOT NULL REFERENCES club_permissions (id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (position_id, club_permission_id)
);

CREATE INDEX club_position_permissions_club_permission_id_idx ON club_position_permissions (club_permission_id);

-- Down Migration
DROP TABLE club_position_permissions;
DROP TABLE club_permissions;
