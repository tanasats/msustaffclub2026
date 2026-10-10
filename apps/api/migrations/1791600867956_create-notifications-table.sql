-- Up Migration
-- การแจ้งเตือนในระบบ (กระดิ่ง) — สร้างพร้อมกับอีเมลแจ้งเตือนจากเหตุการณ์เดียวกัน แต่แสดงเสมอ
-- ไม่ขึ้นกับสวิตช์อีเมลของผู้ดูแลระบบหรือค่าตั้งรับอีเมลของผู้ใช้ เก็บ 180 วันแล้วลบอัตโนมัติ (PDPA: เก็บเท่าที่จำเป็น)
CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- ชนิดเหตุการณ์ (ชุดเดียวกับ email_outbox.kind เช่น advisor_nominated)
  kind        text        NOT NULL,
  -- กันแจ้งซ้ำ: เหตุการณ์เดิมถึงผู้ใช้เดิมครั้งเดียว
  dedupe_key  text        NOT NULL,
  title       text        NOT NULL,
  body        text        NOT NULL,
  -- path ภายในเว็บ (ขึ้นต้นด้วย /) ที่จะพาไปเมื่อคลิก
  link_path   text        NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_dedupe_key UNIQUE (dedupe_key),
  CONSTRAINT notifications_link_path_internal CHECK (link_path LIKE '/%' AND link_path NOT LIKE '//%')
);

-- รายการของผู้ใช้เรียงใหม่สุดก่อน
CREATE INDEX notifications_user_id_created_at_idx ON notifications (user_id, created_at DESC);
-- นับรายการที่ยังไม่อ่าน (ตัวเลขบนกระดิ่ง ถามทุกหน้า)
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
-- ลบรายการเก่าตามรอบ
CREATE INDEX notifications_created_at_idx ON notifications (created_at);

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE notifications;
