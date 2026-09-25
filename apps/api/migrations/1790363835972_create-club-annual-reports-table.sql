-- Up Migration
-- รายงานประจำปีงบประมาณเสนอสโมสร (ระเบียบข้อ 16: ก่อนสิ้นวาระ 30 วัน)
-- ร่าง → ส่ง (club_report:submit) → เจ้าหน้าที่สโมสรรับทราบ (club_report:review)
CREATE TABLE club_annual_reports (
  id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
  club_id               uuid        NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
  fiscal_year           integer     NOT NULL,
  status                text        NOT NULL DEFAULT 'draft',
  -- สรุปผลการดำเนินงาน และปัญหา/อุปสรรค/ข้อเสนอแนะ
  summary               text,
  obstacles             text,
  -- สถิติและรายการกิจกรรมทั้งปี ณ เวลาที่ส่ง (ร่างคำนวณจากข้อมูลปัจจุบัน)
  stats_snapshot        jsonb,
  activities_snapshot   jsonb,
  created_by            uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  submitted_by          uuid        REFERENCES users (id) ON DELETE RESTRICT,
  submitted_at          timestamptz,
  acknowledged_by       uuid        REFERENCES users (id) ON DELETE RESTRICT,
  acknowledged_at       timestamptz,
  acknowledgement_note  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_annual_reports_club_year_key UNIQUE (club_id, fiscal_year),
  CONSTRAINT club_annual_reports_fiscal_year_range CHECK (fiscal_year BETWEEN 2500 AND 2700),
  CONSTRAINT club_annual_reports_status_check CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  CONSTRAINT club_annual_reports_submitted_consistency
    CHECK (status = 'draft' OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL
                                AND stats_snapshot IS NOT NULL AND activities_snapshot IS NOT NULL)),
  CONSTRAINT club_annual_reports_acknowledged_consistency
    CHECK ((status = 'acknowledged') = (acknowledged_at IS NOT NULL))
);

-- รายงานที่รอเจ้าหน้าที่รับทราบ / ภาพรวมรายปี
CREATE INDEX club_annual_reports_year_status_idx ON club_annual_reports (fiscal_year, status);
CREATE INDEX club_annual_reports_created_by_idx ON club_annual_reports (created_by);

CREATE TRIGGER club_annual_reports_set_updated_at
  BEFORE UPDATE ON club_annual_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_annual_reports;
