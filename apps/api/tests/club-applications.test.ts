import { request } from './helpers/http.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { buddhistYearOf, fiscalYearOf, toThaiDigits } from '../src/services/fiscal-year.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { createTestClub } from './helpers/clubs.js';

beforeEach(resetDatabase);

const app = createApp();

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

// ผู้ใช้ที่ login แล้ว (ค่าเริ่มต้น = บุคลากร role user + staff)
async function actor(options: { email?: string; roles?: string[] } = {}): Promise<Actor> {
  const user = await createTestUser({ email: options.email });
  for (const role of options.roles ?? ['user', 'staff']) await grantRole(user.id, role);
  return { ...user, cookie: await createSessionCookie(user.id) };
}

// บุคลากรที่เคย login แล้วแต่ไม่ต้องใช้ session (ใช้เป็นกรรมการ/สมาชิก)
async function staffUser(email?: string) {
  return createTestUser({ email });
}

function get(who: Actor, path: string) {
  return request(app).get(path).set('Cookie', who.cookie);
}

function send(method: 'post' | 'patch' | 'put', who: Actor, path: string, body: object = {}) {
  return request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
}

async function createDraft(who: Actor, nameTh = 'ชมรมดนตรีไทย'): Promise<string> {
  const res = await send('post', who, '/club-applications', { nameTh });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function categoryId(code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM club_categories WHERE code = $1', [code]);
  return rows[0]!.id;
}

async function roleWith(permission: string): Promise<string> {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2
     ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

// ทำให้คำขอพร้อมยื่น (ครบทุกเงื่อนไข ยกเว้นการยินยอมของที่ปรึกษา)
async function completeDraft(who: Actor, id: string) {
  const advisor = await staffUser('advisor.one@msu.ac.th');
  const secretary = await staffUser();
  const others = await Promise.all([staffUser(), staffUser(), staffUser()]);
  await send('patch', who, `/club-applications/${id}`, {
    categoryId: await categoryId('ethics_culture'),
    objectives: ['ส่งเสริมดนตรีไทย'],
  });
  await send('put', who, `/club-applications/${id}/advisors`, { advisors: [{ userId: advisor.id }] });
  await send('put', who, `/club-applications/${id}/committee`, {
    committee: [
      { userId: who.id, positionCode: 'president' },
      { userId: secretary.id, positionCode: 'secretary' },
    ],
  });
  await send('put', who, `/club-applications/${id}/members`, { memberUserIds: others.map((u) => u.id) });
  return { advisor, secretary, others };
}

describe('POST /club-applications (สร้างคำขอจัดตั้ง)', () => {
  it('บุคลากรสร้างฉบับร่างได้: ผู้ยื่นเป็นประธาน, ระเบียบเติมชื่อชมรมและปี, มี log การสร้าง', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant, 'ชมรมดนตรีไทย');

    const res = await get(applicant, `/club-applications/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: 'establish',
      status: 'draft',
      fiscalYear: fiscalYearOf(),
      nameTh: 'ชมรมดนตรีไทย',
      applicant: { id: applicant.id },
      committee: [{ user: { id: applicant.id }, position: { code: 'president' }, positionTitle: 'ประธานชมรม' }],
      advisors: [],
      members: [],
    });
    expect(res.body.regulationText).toContain('ระเบียบชมรมดนตรีไทย พ.ศ.');
    expect(res.body.regulationText).not.toContain('ชมรมชมรม');
    expect(res.body.regulationText).toContain(`พ.ศ. ${toThaiDigits(buddhistYearOf())}`);
    expect(res.body.regulationText).not.toContain('{{');
    expect(res.body.events).toMatchObject([{ fromStatus: null, toStatus: 'draft', actorUserId: applicant.id }]);
  });

  it('นิสิตและผู้ใช้ที่ไม่มี role staff สร้างไม่ได้ (403)', async () => {
    const student = await actor({ email: '65010999001@msu.ac.th', roles: ['user', 'student'] });
    const plainUser = await actor({ roles: ['user'] });
    expect((await send('post', student, '/club-applications', { nameTh: 'ชมรม ก' })).status).toBe(403);
    expect((await send('post', plainUser, '/club-applications', { nameTh: 'ชมรม ก' })).status).toBe(403);
  });

  it('ปีงบประมาณต้องเป็นปีปัจจุบันหรือปีถัดไป', async () => {
    const applicant = await actor();
    const ok = await send('post', applicant, '/club-applications', { nameTh: 'ชมรม ก', fiscalYear: fiscalYearOf() + 1 });
    expect(ok.status).toBe(201);
    const bad = await send('post', applicant, '/club-applications', { nameTh: 'ชมรม ข', fiscalYear: fiscalYearOf() + 2 });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('INVALID_FISCAL_YEAR');
  });

  it('ชื่อว่าง → 400 พร้อมบอกฟิลด์ที่ผิด', async () => {
    const res = await send('post', await actor(), '/club-applications', { nameTh: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('nameTh');
  });
});

describe('สิทธิ์ดูคำขอ', () => {
  it('ผู้อื่นดูไม่ได้ (404), ผู้มีสิทธิ์ตรวจดูได้, ที่ปรึกษาที่ถูกเสนอดูได้แม้ยังไม่เคย login ตอนถูกเสนอ', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors`, { advisors: [{ email: 'future.advisor@msu.ac.th' }] });

    const stranger = await actor();
    expect((await get(stranger, `/club-applications/${id}`)).status).toBe(404);

    const reviewer = await actor({ roles: ['user', 'staff', await roleWith('club_application:review')] });
    expect((await get(reviewer, `/club-applications/${id}`)).status).toBe(200);

    // ที่ปรึกษาเพิ่ง login ครั้งแรกหลังถูกเสนอ → จับคู่ด้วย email
    const advisor = await actor({ email: 'future.advisor@msu.ac.th' });
    expect((await get(advisor, `/club-applications/${id}`)).status).toBe(200);
  });

  it('id ไม่ใช่ uuid → 404', async () => {
    expect((await get(await actor(), '/club-applications/abc')).status).toBe(404);
  });

  it('GET /club-applications/mine คืนเฉพาะคำขอของฉัน', async () => {
    const me = await actor();
    const other = await actor();
    const mine = await createDraft(me, 'ชมรมของฉัน');
    await createDraft(other, 'ชมรมของคนอื่น');
    const res = await get(me, '/club-applications/mine');
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([mine]);
  });
});

describe('PATCH /club-applications/:id (ข้อมูลทั่วไป)', () => {
  it('แก้ข้อมูลได้ และเปลี่ยนชื่อชมรมแล้วชื่อในระเบียบเปลี่ยนตาม', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant, 'ชมรมเดิม');

    const res = await send('patch', applicant, `/club-applications/${id}`, {
      nameTh: 'ชมรมใหม่',
      categoryId: await categoryId('academic'),
      motto: '  สามัคคีคือพลัง  ',
      objectives: ['ข้อหนึ่ง', 'ข้อสอง'],
      contactEmail: 'club@msu.ac.th',
    });

    expect(res.status).toBe(204);
    const detail = (await get(applicant, `/club-applications/${id}`)).body;
    expect(detail).toMatchObject({
      nameTh: 'ชมรมใหม่',
      category: { code: 'academic' },
      motto: 'สามัคคีคือพลัง',
      objectives: ['ข้อหนึ่ง', 'ข้อสอง'],
      contactEmail: 'club@msu.ac.th',
    });
    expect(detail.regulationText).toContain('ชมรมใหม่');
    expect(detail.regulationText).not.toContain('ชมรมเดิม');
  });

  it('ส่ง null เพื่อล้างค่า และฟิลด์ที่ไม่ได้ส่งไม่ถูกแตะ', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    await send('patch', applicant, `/club-applications/${id}`, { motto: 'คำขวัญ', history: 'ประวัติ' });
    await send('patch', applicant, `/club-applications/${id}`, { motto: null });
    const detail = (await get(applicant, `/club-applications/${id}`)).body;
    expect(detail.motto).toBeNull();
    expect(detail.history).toBe('ประวัติ');
  });

  it('ฟิลด์ที่ไม่รู้จัก → 400, ประเภทที่ไม่มีอยู่ → 422', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    expect((await send('patch', applicant, `/club-applications/${id}`, { status: 'approved' })).status).toBe(400);
    const res = await send('patch', applicant, `/club-applications/${id}`, {
      categoryId: '01900000-0000-7000-8000-000000000000',
    });
    expect(res.status).toBe(422);
  });

  it('ผู้ที่ไม่ใช่ผู้ยื่นแก้ไม่ได้ (404)', async () => {
    const id = await createDraft(await actor());
    expect((await send('patch', await actor(), `/club-applications/${id}`, { motto: 'x' })).status).toBe(404);
  });

  it('คำขอที่ยกเลิกแล้วแก้ไม่ได้ (409) และยกเลิกมี log', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    expect((await send('post', applicant, `/club-applications/${id}/cancel`, { note: 'ยื่นผิด' })).status).toBe(204);

    const res = await send('patch', applicant, `/club-applications/${id}`, { motto: 'x' });
    expect(res.status).toBe(409);
    const detail = (await get(applicant, `/club-applications/${id}`)).body;
    expect(detail.status).toBe('cancelled');
    expect(detail.events.at(-1)).toMatchObject({ fromStatus: 'draft', toStatus: 'cancelled', note: 'ยื่นผิด' });
  });
});

describe('PUT /club-applications/:id/advisors', () => {
  it('ระบุด้วย userId หรือ email ได้ และ email ของผู้ใช้ที่มีอยู่แล้วถูกผูก user ให้', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const known = await staffUser('known.advisor@msu.ac.th');

    const res = await send('put', applicant, `/club-applications/${id}/advisors`, {
      advisors: [{ email: 'Known.Advisor@msu.ac.th' }, { email: 'new.advisor@msu.ac.th' }],
    });

    expect(res.status).toBe(204);
    const { advisors } = (await get(applicant, `/club-applications/${id}`)).body;
    expect(advisors).toMatchObject([
      { email: 'known.advisor@msu.ac.th', user: { id: known.id }, sortOrder: 1, consentStatus: 'pending' },
      { email: 'new.advisor@msu.ac.th', user: null, sortOrder: 2, consentStatus: 'pending' },
    ]);
  });

  it.each([
    ['เกิน 2 คน', [{ email: 'a.a@msu.ac.th' }, { email: 'b.b@msu.ac.th' }, { email: 'c.c@msu.ac.th' }], 'TOO_MANY_ADVISORS'],
    ['นอกโดเมน', [{ email: 'someone@gmail.com' }], 'ADVISOR_EMAIL_NOT_ALLOWED'],
    ['บัญชีนิสิต', [{ email: '65010999001@msu.ac.th' }], 'ADVISOR_EMAIL_NOT_ALLOWED'],
    ['ซ้ำกัน', [{ email: 'a.a@msu.ac.th' }, { email: 'A.A@msu.ac.th' }], 'DUPLICATE_ADVISOR'],
  ])('ปฏิเสธ: %s', async (_label, advisors, code) => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const res = await send('put', applicant, `/club-applications/${id}/advisors`, { advisors });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(code);
  });

  it('ผู้ยื่นเป็นที่ปรึกษาของตัวเองไม่ได้', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const res = await send('put', applicant, `/club-applications/${id}/advisors`, { advisors: [{ userId: applicant.id }] });
    expect(res.body.error.code).toBe('ADVISOR_IS_APPLICANT');
  });

  it('แก้รายชื่อ/สลับลำดับแล้ว ที่ปรึกษาคนเดิมยังคงผลการยินยอมเดิม', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors`, {
      advisors: [{ email: 'first.adv@msu.ac.th' }, { email: 'second.adv@msu.ac.th' }],
    });
    await pool.query(
      "UPDATE club_application_advisors SET consent_status = 'accepted', responded_at = now() WHERE email = 'second.adv@msu.ac.th'",
    );

    await send('put', applicant, `/club-applications/${id}/advisors`, {
      advisors: [{ email: 'second.adv@msu.ac.th' }, { email: 'third.adv@msu.ac.th' }],
    });

    const { advisors } = (await get(applicant, `/club-applications/${id}`)).body;
    expect(advisors).toMatchObject([
      { email: 'second.adv@msu.ac.th', sortOrder: 1, consentStatus: 'accepted' },
      { email: 'third.adv@msu.ac.th', sortOrder: 2, consentStatus: 'pending' },
    ]);
  });
});

describe('PUT /club-applications/:id/committee', () => {
  it('บันทึกกรรมการได้ ตำแหน่งยืดหยุ่น (ตั้งชื่อตำแหน่งเองได้)', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const [vp1, vp2, welfare] = await Promise.all([staffUser(), staffUser(), staffUser()]);

    const res = await send('put', applicant, `/club-applications/${id}/committee`, {
      committee: [
        { userId: applicant.id, positionCode: 'president', workLocation: 'อาคาร A', contactPhone: '0800000000' },
        { userId: vp1.id, positionCode: 'vice_president', positionTitle: 'รองประธานคนที่ 1' },
        { userId: vp2.id, positionCode: 'vice_president', positionTitle: 'รองประธานคนที่ 2' },
        { userId: welfare.id, positionCode: 'committee_member', positionTitle: 'ฝ่ายสวัสดิการ' },
      ],
    });

    expect(res.status).toBe(204);
    const { committee } = (await get(applicant, `/club-applications/${id}`)).body;
    expect(committee.map((c: { positionTitle: string }) => c.positionTitle)).toEqual([
      'ประธานชมรม',
      'รองประธานคนที่ 1',
      'รองประธานคนที่ 2',
      'ฝ่ายสวัสดิการ',
    ]);
    expect(committee[0]).toMatchObject({ workLocation: 'อาคาร A', contactPhone: '0800000000' });
  });

  it('ปฏิเสธ: ประธาน 2 คน / ประธานไม่ใช่ผู้ยื่น / คนเดียวหลายตำแหน่ง / ตำแหน่งไม่มีอยู่ / ตำแหน่งที่ปรึกษา', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const other = await staffUser();
    const put = (committee: object[]) => send('put', applicant, `/club-applications/${id}/committee`, { committee });

    expect((await put([{ userId: applicant.id, positionCode: 'president' }, { userId: other.id, positionCode: 'president' }])).body.error.code).toBe('POSITION_LIMIT_EXCEEDED');
    expect((await put([{ userId: other.id, positionCode: 'president' }])).body.error.code).toBe('APPLICANT_MUST_BE_PRESIDENT');
    expect((await put([{ userId: applicant.id, positionCode: 'president' }, { userId: applicant.id, positionCode: 'secretary' }])).body.error.code).toBe('DUPLICATE_COMMITTEE_MEMBER');
    expect((await put([{ userId: applicant.id, positionCode: 'president' }, { userId: other.id, positionCode: 'king' }])).body.error.code).toBe('POSITION_NOT_FOUND');
    expect((await put([{ userId: applicant.id, positionCode: 'president' }, { userId: other.id, positionCode: 'advisor' }])).body.error.code).toBe('POSITION_NOT_FOUND');
  });

  it('ปฏิเสธผู้ใช้ที่ไม่เคย login / ถูกปิดบัญชี / เป็นนิสิต', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const inactive = await createTestUser({ isActive: false });
    const student = await createTestUser({ email: '65010999002@msu.ac.th' });
    const put = (userId: string) =>
      send('put', applicant, `/club-applications/${id}/committee`, {
        committee: [{ userId: applicant.id, positionCode: 'president' }, { userId, positionCode: 'secretary' }],
      });

    expect((await put('01900000-0000-7000-8000-000000000000')).body.error.code).toBe('USER_NOT_FOUND');
    expect((await put(inactive.id)).body.error.code).toBe('USER_INACTIVE');
    expect((await put(student.id)).body.error.code).toBe('USER_NOT_ELIGIBLE');
  });
});

describe('ชื่อชมรมในระเบียบ', () => {
  it('กรอกชื่อโดยไม่มีคำว่า "ชมรม" ก็ได้ชื่อเต็มในระเบียบ และเปลี่ยนชื่อแล้วระเบียบตาม', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant, 'ดนตรีไทย');
    await send('patch', applicant, `/club-applications/${id}`, { nameTh: 'ชมรมดนตรีสากล' });
    const { regulationText } = (await get(applicant, `/club-applications/${id}`)).body;
    expect(regulationText).toContain('ระเบียบชมรมดนตรีสากล พ.ศ.');
    expect(regulationText).not.toContain('ดนตรีไทย');
    expect(regulationText).not.toContain('ชมรมชมรม');
  });
});

describe('PUT members / activities', () => {
  it('บันทึกสมาชิก (ตัดรายชื่อซ้ำ) และแผนกิจกรรมตามลำดับ', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const [a, b] = await Promise.all([staffUser(), staffUser()]);

    expect((await send('put', applicant, `/club-applications/${id}/members`, { memberUserIds: [a.id, b.id, a.id] })).status).toBe(204);
    expect(
      (
        await send('put', applicant, `/club-applications/${id}/activities`, {
          activities: [
            { activityDate: '2026-11-01', activityTime: '09.00–12.00 น.', title: 'ซ้อมดนตรี' },
            { title: 'แสดงงานปีใหม่', note: 'รอยืนยันวัน' },
          ],
        })
      ).status,
    ).toBe(204);

    const detail = (await get(applicant, `/club-applications/${id}`)).body;
    expect(detail.members.map((m: { id: string }) => m.id).sort()).toEqual([a.id, b.id].sort());
    expect(detail.activities).toEqual([
      { activityDate: '2026-11-01', activityTime: '09.00–12.00 น.', title: 'ซ้อมดนตรี', note: null },
      { activityDate: null, activityTime: null, title: 'แสดงงานปีใหม่', note: 'รอยืนยันวัน' },
    ]);
  });
});

describe('GET /club-applications/:id/validation', () => {
  it('ฉบับร่างใหม่: บอกสิ่งที่ยังขาด', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const { issues } = (await get(applicant, `/club-applications/${id}/validation`)).body;
    expect(issues.map((i: { code: string }) => i.code)).toEqual([
      'CATEGORY_REQUIRED',
      'OBJECTIVES_REQUIRED',
      'ADVISOR_REQUIRED',
      'MIN_MEMBERS',
    ]);
  });

  it('กรอกครบ: ไม่มีสิ่งที่ขาด (สมาชิก 5 คน นับรวมกรรมการ)', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    await completeDraft(applicant, id); // ประธาน + เลขาฯ + สมาชิก 3 = 5
    const { issues } = (await get(applicant, `/club-applications/${id}/validation`)).body;
    expect(issues).toEqual([]);
  });

  it('สมาชิกที่ถูกปิดบัญชีภายหลังไม่นับ และแจ้งเตือน', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant);
    const { others } = await completeDraft(applicant, id);
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [others[0]!.id]);
    const { issues } = (await get(applicant, `/club-applications/${id}/validation`)).body;
    expect(issues.map((i: { code: string }) => i.code)).toEqual(['INACTIVE_USERS', 'MIN_MEMBERS']);
  });

  it('ชื่อซ้ำกับชมรมที่มีอยู่, ประเภท "อื่น ๆ" ต้องระบุรายละเอียด, ที่ปรึกษาเป็นกรรมการไม่ได้', async () => {
    const applicant = await actor();
    const id = await createDraft(applicant, 'ชมรมหมากรุก');
    const { advisor } = await completeDraft(applicant, id);
    await createTestClub({ name: 'ชมรมหมากรุก' });
    await send('patch', applicant, `/club-applications/${id}`, { categoryId: await categoryId('other') });
    await send('put', applicant, `/club-applications/${id}/committee`, {
      committee: [
        { userId: applicant.id, positionCode: 'president' },
        { userId: advisor.id, positionCode: 'secretary' },
      ],
    });

    const { issues } = (await get(applicant, `/club-applications/${id}/validation`)).body;
    expect(issues.map((i: { code: string }) => i.code)).toEqual([
      'CLUB_NAME_TAKEN',
      'CATEGORY_DETAIL_REQUIRED',
      'ADVISOR_IN_COMMITTEE',
    ]);
  });
});

describe('GET /users/search', () => {
  it('ค้นจากชื่อหรือ email เฉพาะบุคลากรที่ใช้งานได้ และต้องมีสิทธิ์ยื่นคำขอ', async () => {
    const searcher = await actor();
    await pool.query("UPDATE users SET name = 'สมชาย ใจดี' WHERE id = $1", [(await staffUser('somchai.j@msu.ac.th')).id]);
    await pool.query("UPDATE users SET name = 'สมชาย นิสิต' WHERE id = $1", [(await staffUser('65010999003@msu.ac.th')).id]);
    const inactive = await createTestUser({ email: 'somchai.old@msu.ac.th', isActive: false });
    await pool.query("UPDATE users SET name = 'สมชาย เก่า' WHERE id = $1", [inactive.id]);

    const res = await get(searcher, '/users/search?q=สมชาย');
    expect(res.status).toBe(200);
    expect(res.body.items.map((u: { email: string }) => u.email)).toEqual(['somchai.j@msu.ac.th']);

    const plain = await actor({ roles: ['user'] });
    expect((await get(plain, '/users/search?q=สมชาย')).status).toBe(403);
  });

  it('อักขระ % และ _ ไม่ถูกตีความเป็น wildcard, คำค้นสั้นกว่า 2 ตัวอักษร → 400', async () => {
    const searcher = await actor();
    await staffUser('someone.a@msu.ac.th');
    expect((await get(searcher, '/users/search?q=%25%25')).body.items).toEqual([]);
    expect((await get(searcher, '/users/search?q=a')).status).toBe(400);
  });
});

describe('ข้อมูลหลักและ log', () => {
  it('GET /club-categories ต้อง login', async () => {
    expect((await request(app).get('/club-categories')).status).toBe(401);
    const res = await get(await actor(), '/club-categories');
    expect(res.body.items).toHaveLength(5);
  });

  it('club_application_events แก้/ลบไม่ได้', async () => {
    const id = await createDraft(await actor());
    await expect(pool.query("UPDATE club_application_events SET note = 'x' WHERE application_id = $1", [id])).rejects.toThrow(
      /ห้ามแก้ไขหรือลบ/,
    );
  });
});
