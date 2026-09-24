import { pool, type Queryable } from '../db/pool.js';

export type RoleChangeAction = 'grant' | 'revoke';

export interface NewRoleChangeLog {
  // null = ระบบเป็นผู้ทำ
  actorUserId: string | null;
  targetUserId: string;
  roleId: string;
  action: RoleChangeAction;
  reason: string;
}

// ต้องเรียกใน transaction เดียวกับการให้/ถอน role เสมอ (ตารางนี้แก้/ลบไม่ได้)
export async function insertRoleChangeLog(input: NewRoleChangeLog, db: Queryable = pool): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO role_change_logs (actor_user_id, target_user_id, role_id, action, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.actorUserId, input.targetUserId, input.roleId, input.action, input.reason],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('บันทึก role_change_logs ไม่สำเร็จ');
  }
  return row.id;
}
