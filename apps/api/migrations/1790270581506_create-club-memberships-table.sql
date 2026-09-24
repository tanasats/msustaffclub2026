-- Up Migration
-- การเป็นสมาชิกชมรม: สมัคร (pending) → กรรมการอนุมัติ (active) / ปฏิเสธ (rejected) → พ้นสภาพ (ended)
CREATE TABLE club_memberships (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id     uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status      text        NOT NULL DEFAULT 'pending',
  applied_at  timestamptz NOT NULL DEFAULT now(),
  -- ผู้อนุมัติ/ปฏิเสธ (NULL = ระบบ เช่น สมาชิกตั้งต้นจากคำขอจัดตั้ง)
  decided_by  uuid        REFERENCES users (id) ON DELETE RESTRICT,
  decided_at  timestamptz,
  ended_on    date,
  -- เหตุพ้นสภาพตามระเบียบข้อ 20
  end_reason  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_memberships_status_check CHECK (status IN ('pending', 'active', 'rejected', 'ended')),
  CONSTRAINT club_memberships_end_consistency CHECK ((status = 'ended') = (ended_on IS NOT NULL AND end_reason IS NOT NULL)),
  CONSTRAINT club_memberships_end_reason_check CHECK (
    end_reason IN ('resigned', 'left_university', 'disciplinary', 'removed_by_resolution', 'deceased', 'club_dissolved')
  )
);

-- 1 คนมีใบสมัครที่รอ หรือสถานะสมาชิกที่ยังมีผล ได้ครั้งละ 1 แถวต่อชมรม
CREATE UNIQUE INDEX club_memberships_current_key
  ON club_memberships (club_id, user_id) WHERE status IN ('pending', 'active');
-- รายชื่อสมาชิก/ผู้สมัครของชมรมตามสถานะ
CREATE INDEX club_memberships_club_id_status_idx ON club_memberships (club_id, status);
-- "ชมรมของฉัน"
CREATE INDEX club_memberships_user_id_idx ON club_memberships (user_id);

CREATE TRIGGER club_memberships_set_updated_at
  BEFORE UPDATE ON club_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_memberships;
