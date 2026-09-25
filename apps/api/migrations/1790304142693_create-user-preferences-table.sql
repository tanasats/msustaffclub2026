-- Up Migration
-- ค่าตั้งค่าส่วนตัวของผู้ใช้ (จำไว้ในฐานข้อมูล ใช้ได้ทุกอุปกรณ์) 1 ผู้ใช้ : 1 แถว
-- ไม่มีแถว = ใช้ค่าเริ่มต้น (สร้างแถวเมื่อผู้ใช้เปลี่ยนค่าครั้งแรก)
CREATE TABLE user_preferences (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- ขนาดตัวอักษร: sm = เล็ก, md = ปกติ, lg = ใหญ่, xl = ใหญ่มาก
  font_scale text        NOT NULL DEFAULT 'md',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_font_scale_check CHECK (font_scale IN ('sm', 'md', 'lg', 'xl'))
);

CREATE TRIGGER user_preferences_set_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE user_preferences;
