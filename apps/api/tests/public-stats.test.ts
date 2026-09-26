import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { fiscalYearOf, fiscalYearRange } from '../src/services/fiscal-year.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const FY = fiscalYearOf();
const { start } = fiscalYearRange(FY);
// วันก่อนเริ่มปีงบประมาณนี้ (= ปีงบประมาณที่แล้ว)
const LAST_FY_DAY = `${Number(start.slice(0, 4))}-09-30`;

async function activity(clubId: string, heldOn: string, by: string, deleted = false) {
  await pool.query(
    `INSERT INTO club_activities (club_id, held_on, title, recorded_by, deleted_at) VALUES ($1, $2::date, 'กิจกรรมทดสอบ', $3, CASE WHEN $4 THEN now() END)`,
    [clubId, heldOn, by, deleted],
  );
}

async function achievement(clubId: string, userId: string, on: string, status: 'approved' | 'pending') {
  await pool.query(
    `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, status, decided_by, decided_at)
     VALUES ($1, $2, 'ผลงานทดสอบ', $3::date, 'university', 'competition', $4,
             CASE WHEN $4 = 'approved' THEN $2::uuid END, CASE WHEN $4 = 'approved' THEN now() END)`,
    [clubId, userId, on, status],
  );
}

describe('GET /public/stats (public)', () => {
  it('ไม่ต้อง login และตั้ง Cache-Control', async () => {
    const res = await request(app).get('/public/stats');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body).toMatchObject({ fiscalYear: FY, activeClubs: 0, members: 0, activities: 0, achievements: 0 });
    // ประเภทที่ยังไม่มีชมรมแสดงเป็น 0
    expect(res.body.categories.length).toBeGreaterThanOrEqual(5);
    expect(res.body.categories.every((c: { clubCount: number }) => c.clubCount === 0)).toBe(true);
  });

  it('นับเฉพาะชมรม active, สมาชิกไม่ซ้ำคน, กิจกรรม/ผลงานที่รับรองในปีงบประมาณนี้ และไม่มีข้อมูลรายบุคคล', async () => {
    const [u1, u2, u3, u4] = await Promise.all([
      createTestUser({ email: 'u1@msu.ac.th' }),
      createTestUser({ email: 'u2@msu.ac.th' }),
      createTestUser({ email: 'u3@msu.ac.th' }),
      createTestUser({ email: 'u4@msu.ac.th' }),
    ]);
    const a = await createTestClub({ name: 'ชมรมเอ' });
    const b = await createTestClub({ name: 'ชมรมบี' });
    const suspended = await createTestClub({ name: 'ชมรมพักกิจการ', status: 'suspended' });
    const deleted = await createTestClub({ name: 'ชมรมที่ลบแล้ว' });
    await pool.query('UPDATE clubs SET deleted_at = now() WHERE id = $1', [deleted]);

    await addMembership(a, u1!.id);
    await addMembership(a, u2!.id);
    await addMembership(a, u3!.id, 'pending'); // ยังไม่อนุมัติ → ไม่นับ
    await addMembership(b, u1!.id); // อยู่ 2 ชมรม → นับครั้งเดียว
    await addMembership(suspended, u4!.id); // ชมรมไม่ active → ไม่นับ
    await addMembership(deleted, u4!.id);

    await activity(a, start, u1!.id);
    await activity(b, start, u1!.id);
    await activity(a, LAST_FY_DAY, u1!.id); // ปีงบประมาณที่แล้ว
    await activity(a, start, u1!.id, true); // ถูกลบ
    await activity(deleted, start, u1!.id); // ชมรมถูกลบ

    await achievement(a, u1!.id, start, 'approved');
    await achievement(a, u2!.id, start, 'pending'); // ยังไม่รับรอง
    await achievement(a, u2!.id, LAST_FY_DAY, 'approved'); // ปีที่แล้ว

    const res = await request(app).get('/public/stats');
    expect(res.body).toMatchObject({ activeClubs: 2, members: 2, activities: 2, achievements: 1 });
    const academic = res.body.categories.find((c: { code: string }) => c.code === 'academic');
    expect(academic).toMatchObject({ nameTh: 'ด้านวิชาการ', clubCount: 2 });

    // จำนวนรวมเท่านั้น: ไม่มีชื่อชมรม อีเมล หรือ id ของผู้ใช้ในคำตอบ
    const raw = JSON.stringify(res.body);
    for (const leak of ['ชมรมเอ', 'u1@msu.ac.th', u1!.id]) expect(raw).not.toContain(leak);
  });
});
