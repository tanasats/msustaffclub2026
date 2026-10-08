-- Up Migration
-- ประวัติบัญชีเพิ่ม: created = ผู้ดูแลเพิ่มบัญชีล่วงหน้า, updated = แก้ข้อมูลบัญชีที่ยังไม่ผูก, linked = เจ้าตัว login ครั้งแรกแล้วผูกบัญชี
-- actor_user_id ของ linked = เจ้าของบัญชีเอง (ไม่มีผู้ดูแลทำ) ขยายค่าที่ยอมรับเท่านั้น
ALTER TABLE user_account_events DROP CONSTRAINT user_account_events_action_check;
ALTER TABLE user_account_events ADD CONSTRAINT user_account_events_action_check
  CHECK (action IN ('deactivated', 'reactivated', 'created', 'updated', 'linked'));

-- Down Migration
ALTER TABLE user_account_events DISABLE TRIGGER user_account_events_immutable;
DELETE FROM user_account_events WHERE action IN ('created', 'updated', 'linked');
ALTER TABLE user_account_events ENABLE TRIGGER user_account_events_immutable;
ALTER TABLE user_account_events DROP CONSTRAINT user_account_events_action_check;
ALTER TABLE user_account_events ADD CONSTRAINT user_account_events_action_check CHECK (action IN ('deactivated', 'reactivated'));
