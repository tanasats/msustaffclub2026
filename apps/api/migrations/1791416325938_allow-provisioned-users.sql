-- Up Migration
-- ผู้ดูแลระบบเพิ่มบุคลากรล่วงหน้า (ยังไม่เคยเข้าระบบ) → google_sub ว่างได้จนกว่าเจ้าตัว login ครั้งแรกแล้วผูกบัญชีด้วยอีเมล
-- ข้อมูลเดิมทุกแถวมี google_sub อยู่แล้ว การยกเลิก NOT NULL ไม่กระทบ
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;
-- ผู้เพิ่มบัญชี (NULL = สร้างเองตอน login)
ALTER TABLE users ADD COLUMN created_by uuid REFERENCES users (id) ON DELETE RESTRICT;
-- บัญชีที่ยังไม่ผูกต้องมีผู้เพิ่มเสมอ
ALTER TABLE users ADD CONSTRAINT users_unlinked_has_creator CHECK (google_sub IS NOT NULL OR created_by IS NOT NULL);
-- อีเมลของบัญชีที่ยังไม่ผูกห้ามซ้ำกัน (ใช้จับคู่ตอน login ต้องได้บัญชีเดียว)
CREATE UNIQUE INDEX users_unlinked_email_key ON users (email) WHERE google_sub IS NULL;

-- Down Migration
-- ย้อนได้เฉพาะเมื่อไม่มีบัญชีที่ยังไม่ผูก (ถ้ามี SET NOT NULL จะล้ม — ตั้งใจ ไม่ลบบัญชีเอง)
DROP INDEX IF EXISTS users_unlinked_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_unlinked_has_creator;
ALTER TABLE users DROP COLUMN IF EXISTS created_by;
ALTER TABLE users ALTER COLUMN google_sub SET NOT NULL;
