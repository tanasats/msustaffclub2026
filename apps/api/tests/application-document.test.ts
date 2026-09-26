import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function actor(email?: string, name?: string): Promise<Actor> {
  const user = await createTestUser({ email });
  if (name) await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, name]);
  await grantRole(user.id, 'user');
  await grantRole(user.id, 'staff');
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const send = (method: 'post' | 'put' | 'patch', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

describe('ข้อมูลสำหรับพิมพ์ชุดเอกสารคำขอ', () => {
  it('คำขอจัดตั้ง: สมาชิก = กรรมการ ∪ สมาชิกที่ระบุ (ไม่ซ้ำ), ที่ปรึกษาพร้อมสังกัด; ผู้ไม่เกี่ยวข้อง → 404', async () => {
    const applicant = await actor(undefined, 'ประธาน ทดสอบ');
    const secretary = await actor(undefined, 'เลขา ทดสอบ');
    const member = await actor(undefined, 'สมาชิก ทดสอบ');
    const advisor = await actor('advisor.doc@msu.ac.th', 'ที่ปรึกษา ทดสอบ');
    const stranger = await actor();

    const { body } = await send('post', applicant, '/club-applications', { nameTh: 'ชมรมดนตรีไทย' });
    const base = `/club-applications/${body.id}`;
    await send('patch', applicant, base, { motto: 'ดนตรีคือชีวิต', objectives: ['ส่งเสริมดนตรีไทย'] });
    await send('put', applicant, `${base}/committee`, {
      committee: [
        { userId: applicant.id, positionCode: 'president', contactPhone: '0800000001' },
        { userId: secretary.id, positionCode: 'secretary' },
      ],
    });
    // ใส่เลขาฯ ซ้ำในรายชื่อสมาชิก → ต้องไม่ซ้ำในเอกสาร
    await send('put', applicant, `${base}/members`, { memberUserIds: [member.id, secretary.id] });
    await send('put', applicant, `${base}/advisors`, { advisors: [{ userId: advisor.id }] });
    await send('put', applicant, `${base}/activities`, { activities: [{ title: 'ซ้อมดนตรีประจำสัปดาห์', activityTime: '17.00 น.' }] });

    const res = await get(applicant, `${base}/document`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'establish', nameTh: 'ชมรมดนตรีไทย', motto: 'ดนตรีคือชีวิต', applicant: { name: 'ประธาน ทดสอบ' } });
    expect(res.body.committee).toMatchObject([
      { name: 'ประธาน ทดสอบ', positionCode: 'president', contactPhone: '0800000001' },
      { name: 'เลขา ทดสอบ', positionCode: 'secretary' },
    ]);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual(['ประธาน ทดสอบ', 'เลขา ทดสอบ', 'สมาชิก ทดสอบ']);
    expect(res.body.advisors).toMatchObject([{ name: 'ที่ปรึกษา ทดสอบ', kind: 'internal', consentStatus: 'pending' }]);
    expect(res.body.activities).toMatchObject([{ title: 'ซ้อมดนตรีประจำสัปดาห์' }]);
    expect(res.body.categories.length).toBeGreaterThan(0);
    // ที่ปรึกษาที่ถูกเสนอดูได้ (ต้องลงนาม) ผู้ไม่เกี่ยวข้องไม่พบ
    expect((await get(advisor, `${base}/document`)).status).toBe(200);
    expect((await get(stranger, `${base}/document`)).status).toBe(404);
  });

  it('คำขอต่อทะเบียน: กรรมการและสมาชิกมาจากข้อมูลจริงของชมรม', async () => {
    const clubId = await createTestClub({ name: 'ชมรมวิ่ง' });
    const president = await actor(undefined, 'ประธานวิ่ง');
    const runner = await actor(undefined, 'นักวิ่ง');
    await addMembership(clubId, president.id, 'active');
    await addCommittee(clubId, president.id, 'president');
    await addMembership(clubId, runner.id, 'active');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO club_applications (type, club_id, fiscal_year, applicant_user_id, name_th)
       VALUES ('renewal', $1, 2570, $2, 'ชมรมวิ่ง') RETURNING id`,
      [clubId, president.id],
    );

    const res = await get(president, `/club-applications/${rows[0]!.id}/document`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'renewal', fiscalYear: 2570 });
    expect(res.body.committee).toMatchObject([{ name: 'ประธานวิ่ง', positionCode: 'president' }]);
    expect(res.body.members.map((m: { name: string }) => m.name).sort()).toEqual(['นักวิ่ง', 'ประธานวิ่ง']);
  });
});
