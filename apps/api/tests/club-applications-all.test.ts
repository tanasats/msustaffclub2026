import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';
import { createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(roles: string[], name?: string): Promise<Actor> {
  const user = await createTestUser();
  if (name) await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, name]);
  for (const role of roles) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
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

async function application(applicantId: string, nameTh: string, status: string, type = 'establish', fiscalYear = 2570) {
  // คำขอต่อทะเบียนต้องผูกกับชมรม
  const clubId = type === 'renewal' ? await createTestClub({ name: nameTh }) : null;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status, club_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [type, fiscalYear, applicantId, nameTh, status, clubId],
  );
  return rows[0]!.id;
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

describe('GET /club-applications/all — คำขอทุกสถานะ (club:read_all)', () => {
  it('super_admin เห็นทุกสถานะ (รวมร่าง/ยกเลิก) พร้อมจำนวนต่อสถานะ และเปิดรายละเอียดฉบับร่างของผู้อื่นได้', async () => {
    const applicant = await actor(['user', 'staff'], 'สมชาย ผู้ยื่น');
    const admin = await actor(['user', 'super_admin']);
    const draft = await application(applicant.id, 'ชมรมหมากรุก', 'draft');
    await application(applicant.id, 'ชมรมดนตรี', 'submitted');
    await application(applicant.id, 'ชมรมวิ่ง', 'cancelled');
    await pool.query('UPDATE club_applications SET deleted_at = now(), deleted_by = applicant_user_id WHERE name_th = $1', ['ชมรมวิ่ง']);
    await application(applicant.id, 'ชมรมถ่ายภาพ', 'returned', 'renewal', 2569);

    const res = await get(admin, '/club-applications/all');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3); // ไม่รวมที่ถูกลบ (soft delete)
    expect(res.body.items.map((i: { nameTh: string }) => i.nameTh).sort()).toEqual(['ชมรมดนตรี', 'ชมรมถ่ายภาพ', 'ชมรมหมากรุก']);
    expect(res.body.items[0]).toMatchObject({ applicantName: 'สมชาย ผู้ยื่น' });
    expect(res.body.byStatus).toEqual({ draft: 1, submitted: 1, returned: 1 });

    expect((await get(admin, `/club-applications/${draft}`)).status).toBe(200);
  });

  it('กรองสถานะ / ประเภท / ปีงบประมาณ / ค้นชื่อชมรมหรือผู้ยื่น และแบ่งหน้า', async () => {
    const a = await actor(['user', 'staff'], 'วิไล ศรีสุข');
    const b = await actor(['user', 'staff'], 'อนันต์ มั่นคง');
    const admin = await actor(['user', 'super_admin']);
    await application(a.id, 'ชมรมหมากรุก', 'draft');
    await application(b.id, 'ชมรมดนตรี', 'submitted');
    await application(b.id, 'ชมรม 100%_จริง', 'reviewed');
    await application(a.id, 'ชมรมถ่ายภาพ', 'returned', 'renewal', 2569);

    const names = async (query: string) =>
      (await get(admin, `/club-applications/all?${query}`)).body.items.map((i: { nameTh: string }) => i.nameTh).sort();
    expect(await names('status=draft,submitted')).toEqual(['ชมรมดนตรี', 'ชมรมหมากรุก']);
    expect(await names('type=renewal')).toEqual(['ชมรมถ่ายภาพ']);
    expect(await names('fiscalYear=2570')).toEqual(['ชมรม 100%_จริง', 'ชมรมดนตรี', 'ชมรมหมากรุก']);
    expect(await names('q=อนันต์')).toEqual(['ชมรม 100%_จริง', 'ชมรมดนตรี']);
    expect(await names('q=หมาก')).toEqual(['ชมรมหมากรุก']);
    // % และ _ ในคำค้นเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard
    expect(await names('q=%25_')).toEqual(['ชมรม 100%_จริง']);

    const page2 = (await get(admin, '/club-applications/all?pageSize=3&page=2')).body;
    expect(page2).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page2.items).toHaveLength(1);
    // จำนวนต่อสถานะตามประเภท/ปี
    expect((await get(admin, '/club-applications/all?type=establish')).body.byStatus).toEqual({ draft: 1, submitted: 1, reviewed: 1 });
    expect((await get(admin, '/club-applications/all?status=bogus')).status).toBe(400);
  });

  it('ผู้ถือ role ที่มี club:read_all ดูได้; ผู้ตรวจ (review อย่างเดียว) และบุคลากรทั่วไป → 403; ไม่ login → 401', async () => {
    const applicant = await actor(['user', 'staff']);
    await application(applicant.id, 'ชมรมหมากรุก', 'draft');
    const reader = await actor(['user', 'staff', await roleWith('club:read_all')]);
    const reviewer = await actor(['user', 'staff', await roleWith('club_application:review')]);

    expect((await get(reader, '/club-applications/all')).body.total).toBe(1);
    expect((await get(reviewer, '/club-applications/all')).status).toBe(403);
    expect((await get(applicant, '/club-applications/all')).status).toBe(403);
    expect((await request(app).get('/club-applications/all')).status).toBe(401);
  });
});
