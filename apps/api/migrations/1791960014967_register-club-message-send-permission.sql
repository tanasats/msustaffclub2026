-- Up Migration
-- สิทธิ์ชมรม: ส่งข้อความถึงสมาชิกชมรม — ผูกกับกรรมการทุกตำแหน่ง (ผู้ใช้ยืนยันแล้ว) ไม่รวมที่ปรึกษาและสมาชิก
INSERT INTO club_permissions (code, description_th)
VALUES ('club_message:send', 'ส่งข้อความแจ้งเตือนถึงสมาชิกชมรม')
ON CONFLICT (code) DO NOTHING;

INSERT INTO club_position_permissions (position_id, club_permission_id)
SELECT p.id, cp.id
  FROM club_positions p
  JOIN club_permissions cp ON cp.code = 'club_message:send'
 WHERE p.kind = 'committee'
ON CONFLICT (position_id, club_permission_id) DO NOTHING;

-- Down Migration
DELETE FROM club_position_permissions WHERE club_permission_id IN (SELECT id FROM club_permissions WHERE code = 'club_message:send');
DELETE FROM club_permissions WHERE code = 'club_message:send';
