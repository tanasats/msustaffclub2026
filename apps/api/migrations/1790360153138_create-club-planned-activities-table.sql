-- Up Migration
-- แผนกิจกรรมประจำปีงบประมาณของชมรม (ระเบียบข้อ 14) เริ่มจากแผนในคำขอจัดตั้ง/ต่อทะเบียน แล้วกรรมการปรับได้
CREATE TABLE club_planned_activities (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id       uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  fiscal_year   integer     NOT NULL,
  planned_date  date,
  -- เวลาแบบข้อความ เช่น "09.00–12.00 น."
  planned_time  text,
  title         text        NOT NULL,
  note          text,
  sort_order    integer     NOT NULL DEFAULT 0,
  -- NULL = มาจากคำขอที่อนุมัติ (ระบบคัดลอก)
  created_by    uuid        REFERENCES users (id) ON DELETE RESTRICT,
  -- คำขอต้นทาง (ใช้กันคัดลอกซ้ำ)
  application_activity_id uuid REFERENCES club_application_activities (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT club_planned_activities_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT club_planned_activities_fiscal_year_range CHECK (fiscal_year BETWEEN 2500 AND 2700),
  CONSTRAINT club_planned_activities_application_activity_key UNIQUE (application_activity_id)
);

-- แผนของชมรมในปีงบประมาณ (ไม่รวมที่ลบแล้ว)
CREATE INDEX club_planned_activities_club_year_idx ON club_planned_activities (club_id, fiscal_year, planned_date)
  WHERE deleted_at IS NULL;
CREATE INDEX club_planned_activities_created_by_idx ON club_planned_activities (created_by) WHERE created_by IS NOT NULL;

CREATE TRIGGER club_planned_activities_set_updated_at
  BEFORE UPDATE ON club_planned_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- เติมแผนของชมรมที่อนุมัติแล้วจากคำขอ (รันซ้ำได้: ข้ามรายการที่เคยคัดลอกแล้วด้วย unique ของ application_activity_id)
INSERT INTO club_planned_activities
  (club_id, fiscal_year, planned_date, planned_time, title, note, sort_order, application_activity_id)
SELECT a.club_id, a.fiscal_year, act.activity_date, act.activity_time, act.title, act.note, act.sort_order, act.id
  FROM club_application_activities act
  JOIN club_applications a ON a.id = act.application_id
 WHERE a.status = 'approved' AND a.club_id IS NOT NULL AND a.deleted_at IS NULL
ON CONFLICT (application_activity_id) DO NOTHING;

-- Down Migration
DROP TABLE club_planned_activities;
