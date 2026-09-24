-- Up Migration
-- แม่แบบระเบียบข้อบังคับชมรม (ตัวแปร {{club_name}}, {{year}} ถูกแทนค่าตอนสร้างคำขอ)
-- เก็บหลายฉบับได้ ใช้ฉบับที่ is_active และ version สูงสุด
CREATE TABLE club_regulation_templates (
  id         uuid        PRIMARY KEY DEFAULT uuidv7(),
  version    integer     NOT NULL,
  body       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_regulation_templates_version_key UNIQUE (version),
  CONSTRAINT club_regulation_templates_body_not_blank CHECK (btrim(body) <> '')
);

CREATE TRIGGER club_regulation_templates_set_updated_at
  BEFORE UPDATE ON club_regulation_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_regulation_templates;
