import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const PDF = new TextEncoder().encode('%PDF-1.4 signed consent');

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

const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);
const send = (method: 'post' | 'put' | 'patch', who: Actor, path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);

const COACH = {
  prefixTh: 'นาย',
  firstNameTh: 'วิชัย',
  lastNameTh: 'นอกมหาวิทยาลัย',
  organization: 'สมาคมกีฬาจังหวัดมหาสารคาม',
  position: 'นายกสมาคม',
  email: 'Wichai@Example.com',
  phone: '0810000000',
};

// อัปโหลดใบคำยินยอมแบบ browser: ขอ URL → PUT ตรงไป Garage → ยืนยัน
async function uploadConsent(who: Actor): Promise<string> {
  const ticket = await send('post', who, '/files/uploads', {
    purpose: 'advisor_consent',
    fileName: 'คำยินยอม-วิชัย.pdf',
    mimeType: 'application/pdf',
    sizeBytes: PDF.length,
  });
  const put = await fetch(ticket.body.uploadUrl, { method: 'PUT', headers: ticket.body.headers, body: PDF });
  expect(put.status).toBe(200);
  expect((await send('post', who, `/files/${ticket.body.fileId}/complete`)).status).toBe(200);
  return ticket.body.fileId as string;
}

async function roleWith(permission: string) {
  const code = `test_${permission.replace(/[^a-z]/g, '_')}`;
  await pool.query('INSERT INTO roles (code, name_th) VALUES ($1, $1) ON CONFLICT DO NOTHING', [code]);
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = $1 AND p.code = $2 ON CONFLICT DO NOTHING`,
    [code, permission],
  );
  return code;
}

// คำขอที่ครบทุกอย่าง ยกเว้นที่ปรึกษา (ประธาน + เลขาฯ + สมาชิก 3 = 5 คน)
async function draftWithoutAdvisors(applicant: Actor): Promise<string> {
  const { body } = await send('post', applicant, '/club-applications', { nameTh: 'ชมรมฟุตบอลบุคลากร' });
  const id = body.id as string;
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM club_categories WHERE code = 'health_sports'");
  await send('patch', applicant, `/club-applications/${id}`, { categoryId: rows[0]!.id, objectives: ['ส่งเสริมการออกกำลังกาย'] });
  const secretary = await createTestUser();
  const members = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
  await send('put', applicant, `/club-applications/${id}/committee`, {
    committee: [
      { userId: applicant.id, positionCode: 'president' },
      { userId: secretary.id, positionCode: 'secretary' },
    ],
  });
  await send('put', applicant, `/club-applications/${id}/members`, { memberUserIds: members.map((m) => m.id) });
  return id;
}

async function issues(who: Actor, id: string): Promise<string[]> {
  return (await get(who, `/club-applications/${id}/validation`)).body.issues.map((i: { code: string }) => i.code);
}

describe('ที่ปรึกษาที่เป็นบุคคลภายนอก', () => {
  it('เพิ่มบุคคลภายนอกได้ (อีเมลเก็บเป็นตัวพิมพ์เล็ก) และแสดงข้อมูลติดต่อในคำขอ', async () => {
    const applicant = await actor();
    const internal = await actor();
    const id = await draftWithoutAdvisors(applicant);

    const res = await send('put', applicant, `/club-applications/${id}/advisors`, {
      advisors: [{ userId: internal.id }, { external: COACH }],
    });

    expect(res.status).toBe(204);
    const { advisors } = (await get(applicant, `/club-applications/${id}`)).body;
    expect(advisors).toMatchObject([
      { kind: 'internal', user: { id: internal.id }, consentStatus: 'pending' },
      {
        kind: 'external',
        email: null,
        user: null,
        external: { firstNameTh: 'วิชัย', organization: 'สมาคมกีฬาจังหวัดมหาสารคาม', email: 'wichai@example.com', phone: '0810000000' },
        consentStatus: 'pending',
        consentFile: null,
      },
    ]);
  });

  it('ต้องมีอีเมลหรือเบอร์โทรอย่างน้อย 1 ช่องทาง', async () => {
    const applicant = await actor();
    const id = await draftWithoutAdvisors(applicant);
    const res = await send('put', applicant, `/club-applications/${id}/advisors`, {
      advisors: [{ external: { ...COACH, email: null, phone: null } }],
    });
    expect(res.status).toBe(400);
  });

  it('มีแต่ที่ปรึกษาภายนอก → ขาดที่ปรึกษาภายใน, ยังไม่แนบใบคำยินยอม → แจ้งให้แนบ', async () => {
    const applicant = await actor();
    const id = await draftWithoutAdvisors(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors`, { advisors: [{ external: COACH }] });
    expect(await issues(applicant, id)).toEqual(['INTERNAL_ADVISOR_REQUIRED', 'EXTERNAL_CONSENT_REQUIRED']);
  });

  it('แนบใบคำยินยอม → ถือว่ายินยอม; แก้ข้อมูลบุคคลภายนอกคนเดิมแล้วไฟล์แนบยังอยู่', async () => {
    const applicant = await actor();
    const internal = await actor();
    const id = await draftWithoutAdvisors(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors`, { advisors: [{ userId: internal.id }, { external: COACH }] });
    const fileId = await uploadConsent(applicant);

    expect((await send('put', applicant, `/club-applications/${id}/advisors/2/consent-file`, { fileId })).status).toBe(204);
    let { advisors } = (await get(applicant, `/club-applications/${id}`)).body;
    expect(advisors[1]).toMatchObject({ consentStatus: 'accepted', consentFile: { id: fileId, originalName: 'คำยินยอม-วิชัย.pdf' } });
    expect(await issues(applicant, id)).toEqual([]);

    const externalId = advisors[1].external.id;
    await send('put', applicant, `/club-applications/${id}/advisors`, {
      advisors: [{ userId: internal.id }, { externalPersonId: externalId, external: { ...COACH, position: 'ที่ปรึกษาสมาคม' } }],
    });
    ({ advisors } = (await get(applicant, `/club-applications/${id}`)).body);
    expect(advisors[1]).toMatchObject({ external: { id: externalId, position: 'ที่ปรึกษาสมาคม' }, consentFile: { id: fileId } });
  });

  it('แนบไฟล์ที่ไม่ใช่ของผู้ยื่น / ยังอัปโหลดไม่เสร็จ / แนบให้ที่ปรึกษาภายใน → ปฏิเสธ', async () => {
    const applicant = await actor();
    const other = await actor();
    const internal = await actor();
    const id = await draftWithoutAdvisors(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors`, { advisors: [{ userId: internal.id }, { external: COACH }] });

    const othersFile = await uploadConsent(other);
    expect((await send('put', applicant, `/club-applications/${id}/advisors/2/consent-file`, { fileId: othersFile })).body.error.code).toBe(
      'INVALID_CONSENT_FILE',
    );
    const pending = await send('post', applicant, '/files/uploads', {
      purpose: 'advisor_consent', fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10,
    });
    expect(
      (await send('put', applicant, `/club-applications/${id}/advisors/2/consent-file`, { fileId: pending.body.fileId })).body.error.code,
    ).toBe('INVALID_CONSENT_FILE');
    const mine = await uploadConsent(applicant);
    expect((await send('put', applicant, `/club-applications/${id}/advisors/1/consent-file`, { fileId: mine })).status).toBe(404);
  });

  it('flow เต็ม: ภายในยินยอมผ่าน login + ภายนอกแนบเอกสาร → เจ้าหน้าที่ต้องยืนยันเอกสารก่อนตรวจผ่าน → อนุมัติแล้วบันทึกที่ปรึกษาภายนอกในชมรม', async () => {
    const applicant = await actor();
    const internal = await actor();
    const officer = await actor(['user', 'staff', await roleWith('club_application:review')]);
    const president = await actor(['user', 'staff', await roleWith('club_application:approve')]);
    const stranger = await actor();
    const id = await draftWithoutAdvisors(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors`, { advisors: [{ userId: internal.id }, { external: COACH }] });
    const fileId = await uploadConsent(applicant);
    await send('put', applicant, `/club-applications/${id}/advisors/2/consent-file`, { fileId });

    expect((await send('post', applicant, `/club-applications/${id}/request-consent`)).status).toBe(204);
    // ขอความยินยอมไม่ล้างการยินยอมของที่ปรึกษาภายนอก (ยินยอมด้วยเอกสารแล้ว)
    expect((await get(applicant, `/club-applications/${id}`)).body.advisors[1].consentStatus).toBe('accepted');
    await send('post', internal, `/club-applications/${id}/advisor-response`, { decision: 'accept' });
    expect((await send('post', applicant, `/club-applications/${id}/submit`)).status).toBe(204);

    // เจ้าหน้าที่เปิดดูใบคำยินยอมได้ คนอื่นไม่ได้
    expect((await get(officer, `/files/${fileId}/download-url`)).status).toBe(200);
    expect((await get(internal, `/files/${fileId}/download-url`)).status).toBe(200);
    expect((await get(stranger, `/files/${fileId}/download-url`)).status).toBe(404);

    const tooEarly = await send('post', officer, `/club-applications/${id}/review`, { decision: 'pass' });
    expect(tooEarly.body.error.code).toBe('EXTERNAL_CONSENT_NOT_VERIFIED');
    expect((await send('post', stranger, `/club-applications/${id}/advisors/2/verify-consent`)).status).toBe(403);
    expect((await send('post', officer, `/club-applications/${id}/advisors/1/verify-consent`)).status).toBe(404);
    expect((await send('post', officer, `/club-applications/${id}/advisors/2/verify-consent`)).status).toBe(204);
    expect((await send('post', officer, `/club-applications/${id}/review`, { decision: 'pass' })).status).toBe(204);

    const decision = await send('post', president, `/club-applications/${id}/decision`, { decision: 'approve' });
    expect(decision.body.status).toBe('approved');
    const { rows } = await pool.query(
      `SELECT user_id, external_person_id IS NOT NULL AS external FROM club_advisors WHERE club_id = $1 ORDER BY external`,
      [decision.body.clubId],
    );
    expect(rows).toEqual([
      { user_id: internal.id, external: false },
      { user_id: null, external: true },
    ]);
    const detail = (await get(applicant, `/club-applications/${id}`)).body;
    expect(detail.advisors[1].consentVerified).toMatchObject({ byName: 'ผู้ใช้ทดสอบ' });
  });

  it('ฐานข้อมูลบังคับ: ที่ปรึกษาเป็นบุคลากรหรือบุคคลภายนอกอย่างใดอย่างหนึ่ง', async () => {
    const applicant = await actor();
    const id = await draftWithoutAdvisors(applicant);
    await expect(
      pool.query(
        "INSERT INTO club_application_advisors (application_id, sort_order) VALUES ($1, 1)",
        [id],
      ),
    ).rejects.toThrow(/club_application_advisors_kind_check/);
  });
});
