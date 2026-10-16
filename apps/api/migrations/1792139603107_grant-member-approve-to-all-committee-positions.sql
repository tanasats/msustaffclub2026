-- Up Migration
-- กรรมการชมรมทุกตำแหน่งอนุมัติใบสมัครและจัดการสมาชิกได้ (club_member:approve) — ผู้ใช้ยืนยันแล้ว
-- เดิมมีเฉพาะประธาน รองประธาน เลขานุการ; สิทธิ์นี้รวมงานจัดการสมาชิกทั้งชุด (อนุมัติ/ปฏิเสธ เชิญ ระงับ รับทราบลาออก ลบรายชื่อ ส่งออก)
INSERT INTO club_position_permissions (position_id, club_permission_id)
SELECT p.id, cp.id
  FROM club_positions p
  JOIN club_permissions cp ON cp.code = 'club_member:approve'
 WHERE p.kind = 'committee'
ON CONFLICT (position_id, club_permission_id) DO NOTHING;

-- Down Migration
-- คืนค่าเดิม: ถอนจากตำแหน่งที่เพิ่มในครั้งนี้ (ประธาน รองประธาน เลขานุการ มีมาตั้งแต่แรก)
DELETE FROM club_position_permissions
 WHERE club_permission_id = (SELECT id FROM club_permissions WHERE code = 'club_member:approve')
   AND position_id IN (SELECT id FROM club_positions WHERE kind = 'committee' AND code NOT IN ('president', 'vice_president', 'secretary'));
