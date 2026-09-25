-- Up Migration
-- บันทึกการประชุมในรายงานรายเดือน (วันที่ วาระ มติ จำนวนผู้เข้าประชุม)
CREATE TABLE club_report_meetings (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  report_id       uuid        NOT NULL REFERENCES club_monthly_reports (id) ON DELETE CASCADE,
  met_on          date        NOT NULL,
  agenda          text        NOT NULL,
  resolution      text,
  attendee_count  integer,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_report_meetings_agenda_not_blank CHECK (btrim(agenda) <> ''),
  CONSTRAINT club_report_meetings_attendee_count_non_negative CHECK (attendee_count IS NULL OR attendee_count >= 0)
);

CREATE INDEX club_report_meetings_report_id_idx ON club_report_meetings (report_id, sort_order);

CREATE TRIGGER club_report_meetings_set_updated_at
  BEFORE UPDATE ON club_report_meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE club_report_meetings;
