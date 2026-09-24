import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { loadSession, requireAuth, requirePermission } from '../src/middlewares/auth.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { requestLogger } from '../src/middlewares/request-logger.js';
import { PERMISSIONS } from '../src/services/permissions.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';

// app เล็ก ๆ สำหรับทดสอบ middleware ตรวจสิทธิ์ (ใช้ middleware ตัวจริงทั้งหมด)
function createProtectedApp() {
  const app = express();
  app.use(requestLogger);
  app.use(cookieParser());
  app.use(loadSession);
  app.get('/login-only', requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/assign', requirePermission(PERMISSIONS.USER_ROLE_ASSIGN), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

async function createRoleWithPermissions(code: string, permissions: string[]): Promise<void> {
  const { rows } = await pool.query<{ id: string }>("INSERT INTO roles (code, name_th) VALUES ($1, $1) RETURNING id", [
    code,
  ]);
  for (const permission of permissions) {
    await pool.query(
      'INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE code = $2',
      [rows[0]!.id, permission],
    );
  }
}

async function userWithRoles(roleCodes: string[]): Promise<string> {
  const user = await createTestUser();
  for (const code of roleCodes) {
    await grantRole(user.id, code);
  }
  return createSessionCookie(user.id);
}

beforeEach(async () => {
  await resetDatabase();
  await createRoleWithPermissions('role_assigner', [PERMISSIONS.USER_ROLE_ASSIGN]);
  await createRoleWithPermissions('viewer', []);
});

describe('requireAuth', () => {
  it('ไม่ login → 401', async () => {
    expect((await request(createProtectedApp()).get('/login-only')).status).toBe(401);
  });

  it('login แล้ว (role user อย่างเดียว) → 200', async () => {
    const cookie = await userWithRoles(['user']);
    expect((await request(createProtectedApp()).get('/login-only').set('Cookie', cookie)).status).toBe(200);
  });
});

describe('requirePermission', () => {
  it('ไม่ login → 401', async () => {
    expect((await request(createProtectedApp()).get('/assign')).status).toBe(401);
  });

  it('login แต่ไม่มี permission → 403', async () => {
    const cookie = await userWithRoles(['user', 'viewer']);
    const res = await request(createProtectedApp()).get('/assign').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('มี permission ผ่าน role → 200', async () => {
    const cookie = await userWithRoles(['user', 'role_assigner']);
    expect((await request(createProtectedApp()).get('/assign').set('Cookie', cookie)).status).toBe(200);
  });

  it('หลาย role ได้สิทธิ์รวมกัน (role หนึ่งไม่มี อีก role มี) → 200', async () => {
    const cookie = await userWithRoles(['viewer', 'role_assigner']);
    expect((await request(createProtectedApp()).get('/assign').set('Cookie', cookie)).status).toBe(200);
  });

  it('super_admin ผ่านทุก permission แม้ไม่ได้ผูก permission ไว้', async () => {
    const cookie = await userWithRoles(['user', 'super_admin']);
    expect((await request(createProtectedApp()).get('/assign').set('Cookie', cookie)).status).toBe(200);
  });

  it('permission ที่ยังไม่ผูกกับ role ใด ใช้ได้เฉพาะ super_admin (ค่าเริ่มต้นคือปฏิเสธ)', async () => {
    await pool.query('DELETE FROM role_permissions');
    const staffCookie = await userWithRoles(['role_assigner']);
    const adminCookie = await userWithRoles(['super_admin']);
    const app = createProtectedApp();
    expect((await request(app).get('/assign').set('Cookie', staffCookie)).status).toBe(403);
    expect((await request(app).get('/assign').set('Cookie', adminCookie)).status).toBe(200);
  });

  it('ถอน permission ออกจาก role แล้วมีผลทันที', async () => {
    const cookie = await userWithRoles(['role_assigner']);
    const app = createProtectedApp();
    expect((await request(app).get('/assign').set('Cookie', cookie)).status).toBe(200);

    await pool.query('DELETE FROM role_permissions');

    expect((await request(app).get('/assign').set('Cookie', cookie)).status).toBe(403);
  });
});
