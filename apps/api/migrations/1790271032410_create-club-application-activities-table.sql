-- Up Migration
-- แผนงานกิจกรรมประจำปีที่เสนอในคำขอ (หน้า 15: วันที่, เวลา, กิจกรรม, หมายเหตุ)
CREATE TABLE club_application_activities (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  application_id uuid        NOT NULL REFERENCES club_applications (id) ON DELETE CASCADE,
  activity_date  date,
  -- เวลาแบบข้อความ เช่น "09.00–12.00 น." (กิจกรรมบางอย่างเป็นช่วงเวลา)
  activity_time  text,
  title          text        NOT NULL,
  note           text,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_application_activities_title_not_blank CHECK (btrim(title) <> '')
);

CREATE INDEX club_application_activities_application_id_idx ON club_application_activities (application_id, sort_order);

CREATE TRIGGER club_application_activities_set_updated_at
  BEFORE UPDATE ON club_application_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_application_activities;
