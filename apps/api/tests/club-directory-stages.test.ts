import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  cookie: string;
}

async function actor(name: string): Promise<Actor> {
  const user = await createTestUser();
  await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, name]);
  for (const role of ['user', 'staff']) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

// คำขอจัดตั้งตามสถานะ พร้อมประธานในคำขอ
async function proposal(applicant: Actor, president: Actor, nameTh: string, status: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status, motto, objectives, submitted_at)
     VALUES ('establish', 2570, $1, $2, $3, 'คำขวัญ', ARRAY['วัตถุประสงค์ 1'], CASE WHEN $3 IN ('submitted', 'reviewed') THEN now() END)
     RETURNING id`,
    [applicant.id, nameTh, status],
  );
  await pool.query(
    `INSERT INTO club_application_committee (application_id, user_id, position_id, position_title, sort_order, contact_phone)
     SELECT $1, $2, id, 'ประธานชมรม', 1, '0812345678' FROM club_positions WHERE code = 'president'`,
    [rows[0]!.id, president.id],
  );
  return rows[0]!.id;
}

describe('ทำเนียบชมรม: ประธานและสถานะต่ออายุ', () => {
  it('การ์ดมีชื่อประธาน; ระหว่างต่ออายุ = มีคำขอต่อทะเบียนที่ยื่นแล้ว (ร่างไม่นับ) และกรองได้', async () => {
    const viewer = await actor('ผู้ชม');
    const president = await actor('ประธาน วิ่ง');
    const running = await createTestClub({ name: 'ชมรมวิ่ง' });
    await addMembership(running, president.id, 'active');
    await addCommittee(running, president.id, 'president');
    const music = await createTestClub({ name: 'ชมรมดนตรี' });
    const chess = await createTestClub({ name: 'ชมรมหมากรุก' });
    for (const [clubId, status] of [[running, 'submitted'], [music, 'draft']] as const) {
      await pool.query(
        `INSERT INTO club_applications (type, club_id, fiscal_year, applicant_user_id, name_th, status) VALUES ('renewal', $1, 2571, $2, 'x', $3)`,
        [clubId, president.id, status],
      );
    }

    const all = (await get(viewer, '/clubs')).body.items as { id: string; presidentName: string | null; renewalPending: boolean }[];
    const byId = new Map(all.map((c) => [c.id, c]));
    expect(byId.get(running)).toMatchObject({ presidentName: 'ประธาน วิ่ง', renewalPending: true });
    expect(byId.get(music)).toMatchObject({ presidentName: null, renewalPending: false });
    expect(byId.get(chess)?.renewalPending).toBe(false);
    expect((await get(viewer, '/clubs?renewing=1')).body.items.map((c: { id: string }) => c.id)).toEqual([running]);
  });
});

describe('ชมรมที่อยู่ระหว่างขอจัดตั้ง', () => {
  it('แสดงเฉพาะคำขอที่ยื่นต่อสโมสรแล้ว (รอตรวจ/รออนุมัติ) พร้อมประธาน; ค้นชื่อได้', async () => {
    const viewer = await actor('ผู้ชม');
    const applicant = await actor('ผู้ยื่น');
    const president = await actor('ประธาน ดนตรี');
    await proposal(applicant, president, 'ชมรมดนตรีไทย', 'submitted');
    await proposal(applicant, president, 'ชมรมโยคะ', 'reviewed');
    for (const status of ['draft', 'awaiting_consent', 'returned', 'approved', 'rejected', 'cancelled']) {
      await proposal(applicant, president, `ชมรม ${status}`, status === 'approved' ? 'rejected' : status);
    }
    const deleted = await proposal(applicant, president, 'ชมรมที่ลบ', 'submitted');
    await pool.query(`UPDATE club_applications SET status = 'cancelled', deleted_at = now(), deleted_by = $2 WHERE id = $1`, [deleted, applicant.id]);

    const res = await get(viewer, '/clubs/proposed');
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { nameTh: string }) => c.nameTh).sort()).toEqual(['ชมรมดนตรีไทย', 'ชมรมโยคะ']);
    expect(res.body.items[0]).toMatchObject({ presidentName: 'ประธาน ดนตรี' });
    expect((await get(viewer, '/clubs/proposed?q=โยคะ')).body.items).toMatchObject([{ nameTh: 'ชมรมโยคะ', status: 'reviewed' }]);
  });

  it('หน้าสรุปสาธารณะ: ไม่มีข้อมูลติดต่อ; ผู้ยื่นได้ canViewApplication; สถานะที่ไม่เปิดเผย → 404', async () => {
    const viewer = await actor('ผู้ชม');
    const applicant = await actor('ผู้ยื่น');
    const president = await actor('ประธาน ดนตรี');
    const id = await proposal(applicant, president, 'ชมรมดนตรีไทย', 'submitted');

    const res = await get(viewer, `/clubs/proposed/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nameTh: 'ชมรมดนตรีไทย', presidentName: 'ประธาน ดนตรี', objectives: ['วัตถุประสงค์ 1'], canViewApplication: false });
    expect(JSON.stringify(res.body)).not.toContain('0812345678');
    expect((await get(applicant, `/clubs/proposed/${id}`)).body.canViewApplication).toBe(true);
    // ผู้ชมทั่วไปยังเปิดคำขอฉบับเต็มไม่ได้
    expect((await get(viewer, `/club-applications/${id}`)).status).toBe(404);

    const draft = await proposal(applicant, president, 'ชมรมร่าง', 'draft');
    expect((await get(viewer, `/clubs/proposed/${draft}`)).status).toBe(404);
    expect((await get(viewer, `/clubs/proposed/${draft}/logo`)).status).toBe(404);
    expect((await request(app).get('/clubs/proposed')).status).toBe(401);
  });
});
