import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff'], email?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  for (const role of roles) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2 ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);

async function draft(applicant: Actor, nameTh = 'ชมรมหมากรุก'): Promise<string> {
  const res = await post(applicant, '/club-applications', { nameTh });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function cancelled(applicant: Actor, nameTh?: string): Promise<string> {
  const id = await draft(applicant, nameTh);
  expect((await post(applicant, `/club-applications/${id}/cancel`)).status).toBe(204);
  return id;
}

const row = async (id: string) =>
  (await pool.query('SELECT status, deleted_at IS NOT NULL AS deleted, deleted_by FROM club_applications WHERE id = $1', [id])).rows[0];

describe('ผู้ยื่นลบคำขอที่ยกเลิกแล้ว (soft delete)', () => {
  it('ลบได้เฉพาะคำขอที่ยกเลิกแล้ว: ข้อมูลยังอยู่ ซ่อนจากผู้ยื่น/ผู้ดูทั้งหมด และบันทึก log', async () => {
    const applicant = await actor();
    const reader = await actor(['user', 'staff', await roleWith('club:read_all')]);
    const active = await draft(applicant, 'ชมรมดนตรี');
    expect((await post(applicant, `/club-applications/${active}/delete`)).body.error.code).toBe('APPLICATION_NOT_DELETABLE');

    const id = await cancelled(applicant);
    expect((await post(applicant, `/club-applications/${id}/delete`)).status).toBe(204);
    expect(await row(id)).toEqual({ status: 'cancelled', deleted: true, deleted_by: applicant.id });
    const { rows: events } = await pool.query('SELECT note FROM club_application_events WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1', [id]);
    expect(events[0].note).toBe('ผู้ยื่นลบคำขอออกจากรายการ');

    // ผู้ยื่นไม่เห็นแล้ว ทั้งในรายการและลิงก์ตรง, ลบซ้ำไม่ได้
    expect((await get(applicant, '/club-applications/mine')).body.items.map((i: { id: string }) => i.id)).toEqual([active]);
    expect((await get(applicant, `/club-applications/${id}`)).status).toBe(404);
    expect((await get(applicant, `/club-applications/${id}/document`)).status).toBe(404);
    expect((await post(applicant, `/club-applications/${id}/delete`)).status).toBe(404);
    // ผู้มี club:read_all (ไม่มีสิทธิ์ดูคำขอที่ลบ) ไม่เห็นทั้งในรายการ แท็บ และลิงก์ตรง
    const all = (await get(reader, '/club-applications/all')).body;
    expect(all.items.map((i: { id: string }) => i.id)).toEqual([active]);
    expect(all.deletedCount).toBeNull();
    expect((await get(reader, '/club-applications/all?deleted=1')).status).toBe(403);
    expect((await get(reader, `/club-applications/${id}`)).status).toBe(404);
  });

  it('ผู้อื่นลบคำขอที่ไม่ใช่ของตัวเองไม่ได้ (แม้เป็น super_admin)', async () => {
    const applicant = await actor();
    const admin = await actor(['user', 'super_admin']);
    const id = await cancelled(applicant);
    expect((await post(admin, `/club-applications/${id}/delete`)).status).toBe(404);
    expect(await row(id)).toMatchObject({ deleted: false });
  });

  it('ลบคำขอต่อทะเบียนที่ยกเลิกแล้วได้เช่นกัน', async () => {
    const applicant = await actor();
    const clubId = await createTestClub();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO club_applications (type, club_id, fiscal_year, applicant_user_id, name_th, status)
       VALUES ('renewal', $1, 2570, $2, 'ชมรมวิ่ง', 'cancelled') RETURNING id`,
      [clubId, applicant.id],
    );
    expect((await post(applicant, `/club-applications/${rows[0]!.id}/delete`)).status).toBe(204);
  });

  it('CHECK: ฐานข้อมูลไม่ยอมให้คำขอที่ไม่ได้ยกเลิกถูกลบ', async () => {
    const applicant = await actor();
    const id = await draft(applicant);
    await expect(
      pool.query('UPDATE club_applications SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [id, applicant.id]),
    ).rejects.toThrow(/club_applications_deleted_only_cancelled/);
  });
});

describe('super_admin ดูและกู้คืนคำขอ (club_application:manage_deleted)', () => {
  it('เห็นแท็บลบแล้วและรายละเอียด (พร้อมผู้ลบ) แล้วกู้คืนเป็นร่าง → ผู้ยื่นแก้ไขต่อได้', async () => {
    const applicant = await actor();
    const admin = await actor(['user', 'super_admin']);
    const id = await cancelled(applicant);
    await post(applicant, `/club-applications/${id}/delete`);

    const tab = (await get(admin, '/club-applications/all?deleted=1')).body;
    expect(tab.items.map((i: { id: string }) => i.id)).toEqual([id]);
    expect(tab.deletedCount).toBe(1);
    expect((await get(admin, '/club-applications/all')).body.items).toEqual([]);
    const detail = await get(admin, `/club-applications/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.deleted).toMatchObject({ byName: expect.any(String) });
    expect((await get(admin, `/club-applications/${id}/document`)).status).toBe(200);

    expect((await post(admin, `/club-applications/${id}/restore`, {})).status).toBe(400); // ต้องมีเหตุผล
    expect((await post(admin, `/club-applications/${id}/restore`, { note: 'ผู้ยื่นขอให้กู้คืน' })).status).toBe(204);
    expect(await row(id)).toEqual({ status: 'draft', deleted: false, deleted_by: null });
    const restored = (await get(applicant, `/club-applications/${id}`)).body;
    expect(restored.deleted).toBeNull();
    expect(restored.events.at(-1)).toMatchObject({ fromStatus: 'cancelled', toStatus: 'draft', note: 'กู้คืนเป็นฉบับร่างโดยผู้ดูแลระบบ: ผู้ยื่นขอให้กู้คืน' });
    const edit = await request(app).patch(`/club-applications/${id}`).set('Cookie', applicant.cookie).set('Origin', WEB_ORIGIN).send({ motto: 'ใหม่' });
    expect(edit.status).toBe(204);
  });

  it('กู้คืนคำขอที่ยกเลิกแต่ยังไม่ลบได้; คำขอที่ไม่ได้ยกเลิกกู้คืนไม่ได้', async () => {
    const applicant = await actor();
    const admin = await actor(['user', 'super_admin']);
    const id = await cancelled(applicant);
    expect((await post(admin, `/club-applications/${id}/restore`, { note: 'ยกเลิกผิด' })).status).toBe(204);
    expect(await row(id)).toMatchObject({ status: 'draft' });
    expect((await post(admin, `/club-applications/${id}/restore`, { note: 'ซ้ำ' })).body.error.code).toBe('APPLICATION_NOT_RESTORABLE');
  });

  it('กู้คืนไม่ได้: ผู้ยื่นถูกปิดบัญชี / ต่อทะเบียนที่มีคำขอปีเดียวกันอยู่แล้ว', async () => {
    const admin = await actor(['user', 'super_admin']);
    const applicant = await actor();
    const id = await cancelled(applicant);
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [applicant.id]);
    expect((await post(admin, `/club-applications/${id}/restore`, { note: 'x' })).body.error.code).toBe('APPLICANT_UNAVAILABLE');

    const president = await actor();
    const clubId = await createTestClub();
    const insert = (status: string) =>
      pool.query<{ id: string }>(
        `INSERT INTO club_applications (type, club_id, fiscal_year, applicant_user_id, name_th, status)
         VALUES ('renewal', $1, 2570, $2, 'ชมรมวิ่ง', $3) RETURNING id`,
        [clubId, president.id, status],
      );
    const old = (await insert('cancelled')).rows[0]!.id;
    await insert('draft');
    expect((await post(admin, `/club-applications/${old}/restore`, { note: 'x' })).body.error.code).toBe('RENEWAL_EXISTS');
  });

  it('ไม่มี permission → 403 (รวมผู้มี club:read_all และผู้ยื่นเอง)', async () => {
    const applicant = await actor();
    const reader = await actor(['user', 'staff', await roleWith('club:read_all')]);
    const id = await cancelled(applicant);
    for (const who of [reader, applicant]) {
      expect((await post(who, `/club-applications/${id}/restore`, { note: 'x' })).status).toBe(403);
    }
  });

  it('ผู้ถือ role ที่ผูก club_application:manage_deleted ทำได้ (ไม่ได้เช็คชื่อ role)', async () => {
    const applicant = await actor();
    const manager = await actor(['user', 'staff', await roleWith('club_application:manage_deleted')]);
    const id = await cancelled(applicant);
    await post(applicant, `/club-applications/${id}/delete`);
    expect((await get(manager, `/club-applications/${id}`)).status).toBe(200);
    expect((await post(manager, `/club-applications/${id}/restore`, { note: 'x' })).status).toBe(204);
  });
});

describe('ข้อมูลของฉัน (PDPA): คำขอที่ลบออกจากรายการยังแสดง เพราะระบบยังเก็บไว้', () => {
  it('แสดงพร้อม deletedAt', async () => {
    const applicant = await actor();
    const id = await cancelled(applicant);
    await post(applicant, `/club-applications/${id}/delete`);
    const d = (await get(applicant, '/me/data')).body;
    expect(d.applications).toMatchObject([{ nameTh: 'ชมรมหมากรุก', status: 'cancelled' }]);
    expect(d.applications[0].deletedAt).toBeTruthy();
  });
});
