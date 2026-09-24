-- Up Migration
-- ตารางเชื่อม role กับ permission (many-to-many) ใช้ PK คู่ (role_id, permission_id) กันผูกซ้ำ
-- ลบ role หรือ permission แล้วการผูกหายตาม (CASCADE) เพราะตารางนี้เป็นแค่การตั้งค่า
CREATE TABLE role_permissions (
  role_id       uuid        NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id uuid        NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

-- PK ค้นจาก role_id ได้อยู่แล้ว เพิ่ม index ฝั่ง permission_id สำหรับ JOIN/ลบย้อนกลับ
CREATE INDEX role_permissions_permission_id_idx ON role_permissions (permission_id);

-- Down Migration
DROP TABLE role_permissions;
