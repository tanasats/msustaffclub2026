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

export interface RoleChangeLogItem {
  id: string;
  action: RoleChangeAction;
  roleCode: string;
  roleNameTh: string;
  reason: string;
  actorName: string | null;
  createdAt: Date;
}

// ประวัติการให้/ถอน role ของผู้ใช้ ล่าสุดก่อน (ใช้ index role_change_logs_target_user_id_created_at_idx)
export async function listRoleChangeLogsForUser(
  userId: string,
  limit: number,
  db: Queryable = pool,
): Promise<RoleChangeLogItem[]> {
  const result = await db.query<RoleChangeLogItem>(
    `SELECT l.id, l.action, r.code AS "roleCode", r.name_th AS "roleNameTh", l.reason,
            a.name AS "actorName", l.created_at AS "createdAt"
       FROM role_change_logs l
       JOIN roles r ON r.id = l.role_id
       LEFT JOIN users a ON a.id = l.actor_user_id
      WHERE l.target_user_id = $1
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}
