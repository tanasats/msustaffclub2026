import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { PERMISSIONS, SYSTEM_ROLES } from '../src/services/permissions.js';
import { createTestUser, getRoleId, resetDatabase } from './helpers/db.js';

beforeEach(resetDatabase);

describe('ข้อมูลตั้งต้นจาก migration', () => {
  it('มี role ระบบ user (ไม่ privileged) และ super_admin (privileged)', async () => {
    const { rows } = await pool.query<{ code: string; is_system: boolean; is_privileged: boolean }>(
      'SELECT code, is_system, is_privileged FROM roles WHERE is_system ORDER BY code',
    );
    expect(rows).toEqual([
      { code: SYSTEM_ROLES.SUPER_ADMIN, is_system: true, is_privileged: true },
      { code: SYSTEM_ROLES.USER, is_system: true, is_privileged: false },
    ]);
  });

  it('permission ทุกตัวในโค้ดถูกลงทะเบียนในตาราง permissions', async () => {
    const codes = Object.values(PERMISSIONS);
    const { rows } = await pool.query<{ code: string }>('SELECT code FROM permissions WHERE code = ANY($1)', [codes]);
    expect(rows.map((row) => row.code).sort()).toEqual([...codes].sort());
  });
});

describe('การป้องกัน role ระบบ', () => {
  it('ห้ามลบ role ระบบ', async () => {
    await expect(pool.query("DELETE FROM roles WHERE code = 'user'")).rejects.toThrow(/ห้ามลบ role ระบบ/);
  });

  it('ห้ามเปลี่ยน code ของ role ระบบ แต่แก้ชื่อได้', async () => {
    await expect(pool.query("UPDATE roles SET code = 'member' WHERE code = 'user'")).rejects.toThrow(/ห้ามเปลี่ยน code/);
    await pool.query("UPDATE roles SET name_th = 'ผู้ใช้งาน' WHERE code = 'user'");
    await pool.query("UPDATE roles SET name_th = 'ผู้ใช้งานทั่วไป' WHERE code = 'user'");
  });

  it('role ที่ไม่ใช่ระบบลบได้', async () => {
    await pool.query("INSERT INTO roles (code, name_th) VALUES ('staff', 'บุคลากร')");
    const result = await pool.query("DELETE FROM roles WHERE code = 'staff'");
    expect(result.rowCount).toBe(1);
  });
});

describe('role_change_logs แก้/ลบไม่ได้', () => {
  it('ปฏิเสธ UPDATE และ DELETE', async () => {
    const user = await createTestUser();
    const roleId = await getRoleId(SYSTEM_ROLES.USER);
    await pool.query(
      "INSERT INTO role_change_logs (target_user_id, role_id, action, reason) VALUES ($1, $2, 'grant', 'test')",
      [user.id, roleId],
    );
    await expect(pool.query("UPDATE role_change_logs SET reason = 'edited'")).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
    await expect(pool.query('DELETE FROM role_change_logs')).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
  });
});

describe('constraint ของข้อมูล', () => {
  it('permission code ต้องเป็นรูปแบบ resource:action', async () => {
    await expect(
      pool.query("INSERT INTO permissions (code, description_th) VALUES ('BadCode', 'x')"),
    ).rejects.toThrow(/permissions_code_format/);
  });

  it('email ของผู้ใช้ต้องเป็นตัวพิมพ์เล็ก', async () => {
    await expect(createTestUser({ email: 'Someone@MSU.ac.th' })).rejects.toThrow(/users_email_lowercase/);
  });

  it('token_hash ของ session ต้องยาว 32 bytes (SHA-256)', async () => {
    const user = await createTestUser();
    await expect(
      pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('\\x00'::bytea, $1, now())", [user.id]),
    ).rejects.toThrow(/sessions_token_hash_length/);
  });

  it('updated_at ถูกตั้งอัตโนมัติเมื่อแก้ไขแถว', async () => {
    const user = await createTestUser();
    await pool.query("UPDATE users SET updated_at = now() - interval '1 day' WHERE id = $1", [user.id]);
    await pool.query("UPDATE users SET name = 'ชื่อใหม่' WHERE id = $1", [user.id]);
    const { rows } = await pool.query<{ fresh: boolean }>(
      "SELECT updated_at > now() - interval '1 minute' AS fresh FROM users WHERE id = $1",
      [user.id],
    );
    expect(rows[0]?.fresh).toBe(true);
  });
});
