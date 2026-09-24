-- Up Migration
-- ผู้ใช้ 1 คนมีได้หลาย role, PK คู่ (user_id, role_id) กันให้ role ซ้ำ
-- ใช้ RESTRICT: ลบ role ที่ยังมีผู้ถืออยู่ไม่ได้ (ต้องถอนออกก่อน และการถอนต้องมี log)
CREATE TABLE user_roles (
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role_id    uuid        NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  -- NULL = ระบบเป็นผู้ให้ (role user ตอน login ครั้งแรก หรือ seed script)
  granted_by uuid        REFERENCES users (id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- ใช้ตอบคำถาม "ใครถือ role นี้บ้าง" เช่น นับ super_admin ที่เหลือก่อนถอน
CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);

-- Down Migration
DROP TABLE user_roles;
