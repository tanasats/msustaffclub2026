-- Up Migration
-- รายงานรายเดือนถึงที่ปรึกษา (ระเบียบข้อ 16): บันทึกการประชุม + กิจกรรมของเดือน
-- ร่าง → ส่ง (club_report:submit) → ที่ปรึกษารับทราบ (club_report:acknowledge)
CREATE TABLE club_monthly_reports (
  id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id               uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  -- วันที่ 1 ของเดือนที่รายงาน
  report_month          date        NOT NULL,
  fiscal_year           integer     NOT NULL,
  status                text        NOT NULL DEFAULT 'draft',
  -- สรุปอื่น ๆ ของเดือน
  summary               text,
  -- กิจกรรมของเดือน ณ เวลาที่ส่ง (ร่างแสดงข้อมูลปัจจุบัน ส่งแล้วเก็บภาพนิ่งไว้ ไม่เปลี่ยนตามการแก้กิจกรรมภายหลัง)
  activities_snapshot   jsonb,
  created_by            uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  submitted_by          uuid        REFERENCES users (id) ON DELETE RESTRICT,
  submitted_at          timestamptz,
  acknowledged_by       uuid        REFERENCES users (id) ON DELETE RESTRICT,
  acknowledged_at       timestamptz,
  acknowledgement_note  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_monthly_reports_club_month_key UNIQUE (club_id, report_month),
  CONSTRAINT club_monthly_reports_first_of_month CHECK (EXTRACT(DAY FROM report_month) = 1),
  CONSTRAINT club_monthly_reports_fiscal_year_range CHECK (fiscal_year BETWEEN 2500 AND 2700),
  CONSTRAINT club_monthly_reports_status_check CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  -- ส่งแล้วต้องมีผู้ส่ง/เวลา/ภาพนิ่ง, รับทราบแล้วต้องมีผู้รับทราบ/เวลา
  CONSTRAINT club_monthly_reports_submitted_consistency
    CHECK (status = 'draft' OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND activities_snapshot IS NOT NULL)),
  CONSTRAINT club_monthly_reports_acknowledged_consistency
    CHECK ((status = 'acknowledged') = (acknowledged_at IS NOT NULL))
);

-- รายงานของชมรมในปีงบประมาณ (unique (club_id, report_month) ครอบการค้นรายเดือนแล้ว)
CREATE INDEX club_monthly_reports_club_year_idx ON club_monthly_reports (club_id, fiscal_year);
-- รายงานที่รอที่ปรึกษารับทราบ
CREATE INDEX club_monthly_reports_submitted_idx ON club_monthly_reports (club_id) WHERE status = 'submitted';
CREATE INDEX club_monthly_reports_created_by_idx ON club_monthly_reports (created_by);

CREATE TRIGGER club_monthly_reports_set_updated_at
  BEFORE UPDATE ON club_monthly_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_monthly_reports;
