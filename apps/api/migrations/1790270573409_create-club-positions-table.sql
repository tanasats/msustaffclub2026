-- Up Migration
-- ตำแหน่งในชมรม ใช้กำหนดสิทธิ์ระดับชมรม (ผ่าน club_position_permissions)
-- kind: committee = กรรมการบริหาร, advisor = ที่ปรึกษา, member = สมาชิก
CREATE TABLE club_positions (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  code         text        NOT NULL,
  name_th      text        NOT NULL,
  kind         text        NOT NULL,
  -- จำนวนสูงสุดต่อชมรม (NULL = ไม่จำกัด) ตรวจที่ service
  max_per_club integer,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_positions_code_key UNIQUE (code),
  CONSTRAINT club_positions_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT club_positions_kind_check CHECK (kind IN ('committee', 'advisor', 'member')),
  CONSTRAINT club_positions_max_per_club_positive CHECK (max_per_club IS NULL OR max_per_club > 0)
);

-- ตำแหน่งแบบ advisor และ member มีได้อย่างละ 1 แถว (ใช้เป็นตัวแทนของที่ปรึกษา/สมาชิกทุกคน)
CREATE UNIQUE INDEX club_positions_single_advisor_member_idx
  ON club_positions (kind) WHERE kind IN ('advisor', 'member');

CREATE TRIGGER club_positions_set_updated_at
  BEFORE UPDATE ON club_positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_positions;
