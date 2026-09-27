-- Up Migration
-- คิวอีเมลแจ้งเตือน (outbox): บันทึกใน transaction เดียวกับเหตุการณ์ แล้ว worker ใน API ส่งออกภายหลัง
-- ทำให้อีเมลไม่หายเมื่อระบบล่ม และการส่งอีเมลล้มเหลวไม่ทำให้การทำรายการหลักล้มตาม
-- สถานะ: pending (รอส่ง) → sending (worker กำลังส่ง) → sent | pending (ลองใหม่) | failed (ครบจำนวนครั้ง)
--        skipped = ยกเลิกเพราะค้างนานเกินไป (เช่น ปิดการส่งอีเมลไว้) ไม่ส่งข่าวเก่าออกไปภายหลัง
-- ลบแถวที่ปิดงานแล้ว (sent/failed/skipped) เมื่อเกิน 90 วัน (PDPA: เก็บเท่าที่จำเป็น)
CREATE TABLE email_outbox (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  -- ประเภทเหตุการณ์ เช่น advisor_nominated (ค่าที่ใช้ได้ประกาศใน src/services/notification-events.ts)
  kind               text        NOT NULL,
  -- กันส่งซ้ำ: เหตุการณ์เดียวกันถึงผู้รับคนเดียวกันได้แถวเดียว
  dedupe_key         text        NOT NULL,
  recipient_user_id  uuid        REFERENCES users (id) ON DELETE RESTRICT,
  recipient_email    text        NOT NULL,
  subject            text        NOT NULL,
  body_text          text        NOT NULL,
  body_html          text        NOT NULL,
  status             text        NOT NULL DEFAULT 'pending',
  attempts           smallint    NOT NULL DEFAULT 0,
  next_attempt_at    timestamptz NOT NULL DEFAULT now(),
  -- ข้อความ error ย่อจากผู้ให้บริการ (ไม่มี token หรือเนื้อหาอีเมล)
  last_error         text,
  sent_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_dedupe_key_key UNIQUE (dedupe_key),
  CONSTRAINT email_outbox_status_check CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  CONSTRAINT email_outbox_sent_consistency CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT email_outbox_attempts_non_negative CHECK (attempts >= 0),
  CONSTRAINT email_outbox_recipient_email_lowercase CHECK (recipient_email = lower(recipient_email))
);

-- worker หาแถวที่ถึงเวลาส่ง (partial index เฉพาะแถวที่รอส่ง จึงเล็กเสมอ)
CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE status = 'pending';
-- หน้าตั้งค่าแสดงรายการล่าสุด และงานลบข้อมูลเก่า
CREATE INDEX email_outbox_created_at_idx ON email_outbox (created_at DESC);
CREATE INDEX email_outbox_recipient_user_id_idx ON email_outbox (recipient_user_id);

CREATE TRIGGER email_outbox_set_updated_at
  BEFORE UPDATE ON email_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE email_outbox;
