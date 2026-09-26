-- Up Migration
-- ชนิดกีฬา (ข้อมูลหลัก) — เจ้าหน้าที่ที่มี permission sport:manage เพิ่ม/แก้/ปิดใช้งานได้ (ไม่ลบ)
CREATE TABLE sports (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  code        text        NOT NULL,
  name_th     text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sports_code_key UNIQUE (code),
  CONSTRAINT sports_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT sports_name_th_not_blank CHECK (btrim(name_th) <> '')
);

CREATE TRIGGER sports_set_updated_at
  BEFORE UPDATE ON sports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ชนิดกีฬาตั้งต้นที่พบบ่อยในกีฬาบุคลากร (รันซ้ำได้)
INSERT INTO sports (code, name_th, sort_order)
VALUES
  ('football',      'ฟุตบอล',        1),
  ('futsal',        'ฟุตซอล',        2),
  ('volleyball',    'วอลเลย์บอล',    3),
  ('basketball',    'บาสเกตบอล',     4),
  ('sepak_takraw',  'เซปักตะกร้อ',   5),
  ('badminton',     'แบดมินตัน',     6),
  ('table_tennis',  'เทเบิลเทนนิส',  7),
  ('tennis',        'เทนนิส',        8),
  ('petanque',      'เปตอง',         9),
  ('running',       'วิ่ง',           10),
  ('swimming',      'ว่ายน้ำ',        11),
  ('cycling',       'จักรยาน',       12),
  ('golf',          'กอล์ฟ',         13),
  ('bowling',       'โบว์ลิ่ง',       14)
ON CONFLICT (code) DO NOTHING;

-- Down Migration
DROP TABLE sports;
