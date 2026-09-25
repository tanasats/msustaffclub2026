import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { storage } from '../src/storage/s3-storage.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

interface Actor {
  id: string;
  cookie: string;
}

async function actor(roles: string[] = ['user', 'staff']): Promise<Actor> {
  const user = await createTestUser();
  for (const role of roles) await grantRole(user.id, role);
  return { id: user.id, cookie: await createSessionCookie(user.id) };
}

const post = (who: Actor, path: string, body: object = {}) =>
  request(app).post(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const put = (who: Actor, path: string, body: object) =>
  request(app).put(path).set('Cookie', who.cookie).set('Origin', WEB_ORIGIN).send(body);
const get = (who: Actor, path: string) => request(app).get(path).set('Cookie', who.cookie);

// อัปโหลดรูปตราแบบเดียวกับ browser: ขอ URL → PUT ตรงไป Garage → ยืนยัน
async function uploadLogo(who: Actor, bytes: Uint8Array = PNG): Promise<string> {
  const ticket = await post(who, '/files/uploads', { purpose: 'club_logo', fileName: 'ตรา.png', mimeType: 'image/png', sizeBytes: bytes.length });
  expect(ticket.status).toBe(201);
  expect((await fetch(ticket.body.uploadUrl, { method: 'PUT', headers: ticket.body.headers, body: bytes })).status).toBe(200);
  expect((await post(who, `/files/${ticket.body.fileId}/complete`)).status).toBe(200);
  return ticket.body.fileId as string;
}

async function objectKeyOf(fileId: string) {
  const { rows } = await pool.query<{ object_key: string; deleted: boolean }>(
    'SELECT object_key, deleted_at IS NOT NULL AS deleted FROM files WHERE id = $1',
    [fileId],
  );
  return rows[0]!;
}

async function clubWithOfficers() {
  const clubId = await createTestClub();
  const president = await actor();
  const treasurer = await actor();
  for (const [who, position] of [[president, 'president'], [treasurer, 'treasurer']] as const) {
    await addMembership(clubId, who.id, 'active');
    await addCommittee(clubId, who.id, position);
  }
  return { clubId, president, treasurer };
}

describe('อัปโหลดรูปตรา', () => {
  it('ผู้ที่ login แล้วขออัปโหลดได้ (ตรวจสิทธิ์ตอนผูกไฟล์) แต่รับเฉพาะ PNG/JPG/WebP ไม่เกิน 2 MB', async () => {
    const student = await actor(['user', 'student']);
    const ask = (overrides: object) =>
      post(student, '/files/uploads', { purpose: 'club_logo', fileName: 'logo.png', mimeType: 'image/png', sizeBytes: 100, ...overrides });

    expect((await ask({})).status).toBe(201);
    expect((await ask({ mimeType: 'image/svg+xml', fileName: 'logo.svg' })).body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await ask({ mimeType: 'application/pdf' })).body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await ask({ sizeBytes: 2 * 1024 * 1024 + 1 })).body.error.code).toBe('FILE_TOO_LARGE');
  });
});

describe('ตราของชมรม', () => {
  it('ประธานตั้งตราได้ → ทุกคนที่ login ดูรูปได้ผ่าน redirect และทำเนียบบอก logoFileId', async () => {
    const { clubId, president } = await clubWithOfficers();
    const outsider = await actor();
    const fileId = await uploadLogo(president);

    expect((await put(president, `/clubs/${clubId}/logo`, { fileId })).status).toBe(204);

    const res = await get(outsider, `/clubs/${clubId}/logo`);
    expect(res.status).toBe(302);
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['cache-control']).toContain('private');
    const image = await fetch(res.headers.location as string);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);

    expect((await get(outsider, '/clubs')).body.items[0].logoFileId).toBe(fileId);
    expect((await get(outsider, `/clubs/${clubId}`)).body.logoFileId).toBe(fileId);
    expect((await request(app).get(`/clubs/${clubId}/logo`)).status).toBe(401);
  });

  it('ตำแหน่งที่ไม่มี club_profile:edit (เหรัญญิก) และสมาชิกทั่วไป → 403', async () => {
    const { clubId, treasurer } = await clubWithOfficers();
    const member = await actor();
    await addMembership(clubId, member.id, 'active');
    for (const who of [treasurer, member]) {
      const fileId = await uploadLogo(who);
      expect((await put(who, `/clubs/${clubId}/logo`, { fileId })).status).toBe(403);
    }
  });

  it('ผูกไฟล์ของคนอื่น / ไฟล์ผิดประเภท / ไฟล์ที่ยังอัปโหลดไม่เสร็จ ไม่ได้', async () => {
    const { clubId, president, treasurer } = await clubWithOfficers();
    const othersFile = await uploadLogo(treasurer);
    expect((await put(president, `/clubs/${clubId}/logo`, { fileId: othersFile })).body.error.code).toBe('FILE_NOT_ATTACHABLE');

    const consent = await post(president, '/files/uploads', { purpose: 'advisor_consent', fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
    expect((await put(president, `/clubs/${clubId}/logo`, { fileId: consent.body.fileId })).body.error.code).toBe('FILE_NOT_ATTACHABLE');

    const pending = await post(president, '/files/uploads', { purpose: 'club_logo', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 10 });
    expect((await put(president, `/clubs/${clubId}/logo`, { fileId: pending.body.fileId })).body.error.code).toBe('FILE_NOT_UPLOADED');
  });

  it('เปลี่ยนตรา → ไฟล์เดิมถูกลบ (soft delete + ลบ object) และเอาตราออกได้', async () => {
    const { clubId, president } = await clubWithOfficers();
    const first = await uploadLogo(president);
    await put(president, `/clubs/${clubId}/logo`, { fileId: first });
    const second = await uploadLogo(president);
    expect((await put(president, `/clubs/${clubId}/logo`, { fileId: second })).status).toBe(204);

    const old = await objectKeyOf(first);
    expect(old.deleted).toBe(true);
    expect(await storage.headObject(old.object_key)).toBeNull();

    expect((await put(president, `/clubs/${clubId}/logo`, { fileId: null })).status).toBe(204);
    expect((await objectKeyOf(second)).deleted).toBe(true);
    expect((await get(president, `/clubs/${clubId}/logo`)).status).toBe(404);
  });

  it('ไฟล์ที่คำขอจัดตั้งยังใช้อยู่ จะไม่ถูกลบเมื่อชมรมเปลี่ยนตรา', async () => {
    const { clubId, president } = await clubWithOfficers();
    const shared = await uploadLogo(president);
    const draft = await post(president, '/club-applications', { nameTh: 'ชมรมที่ใช้ตราร่วมกัน' });
    await put(president, `/club-applications/${draft.body.id}/logo`, { fileId: shared });
    await put(president, `/clubs/${clubId}/logo`, { fileId: shared });

    await put(president, `/clubs/${clubId}/logo`, { fileId: await uploadLogo(president) });

    const kept = await objectKeyOf(shared);
    expect(kept.deleted).toBe(false);
    expect(await storage.headObject(kept.object_key)).not.toBeNull();
  });
});

describe('ตราในคำขอจัดตั้ง', () => {
  it('ผู้ยื่นแนบตราในร่างได้ → ผู้ยื่นดูได้ ผู้อื่นที่ไม่เกี่ยวข้องไม่พบ (404)', async () => {
    const applicant = await actor();
    const stranger = await actor();
    const { body } = await post(applicant, '/club-applications', { nameTh: 'ชมรมถ่ายภาพ' });
    const fileId = await uploadLogo(applicant);

    expect((await put(applicant, `/club-applications/${body.id}/logo`, { fileId })).status).toBe(204);
    expect((await get(applicant, `/club-applications/${body.id}`)).body.logoFileId).toBe(fileId);
    expect((await get(applicant, `/club-applications/${body.id}/logo`)).status).toBe(302);
    expect((await get(stranger, `/club-applications/${body.id}/logo`)).status).toBe(404);
    // ผู้อื่นแก้ตราในคำขอของคนอื่นไม่ได้
    expect((await put(stranger, `/club-applications/${body.id}/logo`, { fileId: await uploadLogo(stranger) })).status).toBe(404);
  });

  it('คำขอที่ไม่อยู่ในสถานะแก้ไขได้ → 409', async () => {
    const applicant = await actor();
    const { body } = await post(applicant, '/club-applications', { nameTh: 'ชมรมวิ่ง' });
    await pool.query("UPDATE club_applications SET status = 'submitted', submitted_at = now() WHERE id = $1", [body.id]);
    const res = await put(applicant, `/club-applications/${body.id}/logo`, { fileId: await uploadLogo(applicant) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPLICATION_NOT_EDITABLE');
  });
});
