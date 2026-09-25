import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole, WEB_ORIGIN } from './helpers/auth.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();
const PDF = new TextEncoder().encode('%PDF-1.4 ใบคำยินยอม');

async function staff() {
  const user = await createTestUser();
  await grantRole(user.id, 'user');
  await grantRole(user.id, 'staff');
  return { ...user, cookie: await createSessionCookie(user.id) };
}

function post(cookie: string, path: string, body: object = {}) {
  return request(app).post(path).set('Cookie', cookie).set('Origin', WEB_ORIGIN).send(body);
}

async function requestUpload(cookie: string, overrides: Record<string, unknown> = {}) {
  return post(cookie, '/files/uploads', {
    purpose: 'advisor_consent',
    fileName: 'ใบคำยินยอม.pdf',
    mimeType: 'application/pdf',
    sizeBytes: PDF.length,
    ...overrides,
  });
}

// อัปโหลดแบบเดียวกับ browser: PUT ตรงไปที่ Garage ด้วย presigned URL
function putToStorage(url: string, headers: Record<string, string>, body: Uint8Array) {
  return fetch(url, { method: 'PUT', headers, body });
}

describe('อัปโหลดไฟล์ผ่าน presigned URL (Garage จริง, bucket ของ test)', () => {
  it('ขอ URL → อัปโหลดตรงไป Garage → ยืนยัน → ขอ URL ดาวน์โหลดแล้วได้ไฟล์เดิม', async () => {
    const me = await staff();
    const ticket = await requestUpload(me.cookie);
    expect(ticket.status).toBe(201);
    expect(ticket.body.uploadUrl).toContain(config.s3.publicEndpoint);
    expect(ticket.body.uploadUrl).toContain(config.s3.bucket);

    expect((await putToStorage(ticket.body.uploadUrl, ticket.body.headers, PDF)).status).toBe(200);
    const done = await post(me.cookie, `/files/${ticket.body.fileId}/complete`);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'uploaded', originalName: 'ใบคำยินยอม.pdf', sizeBytes: PDF.length });

    const link = await request(app).get(`/files/${ticket.body.fileId}/download-url`).set('Cookie', me.cookie);
    expect(link.status).toBe(200);
    const downloaded = await fetch(link.body.url);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(PDF);

    // object key เป็น UUID ไม่ใช่ชื่อไฟล์ต้นฉบับ
    const { rows } = await pool.query('SELECT object_key FROM files');
    expect(rows[0].object_key).toMatch(/^advisor-consents\/[0-9a-f-]{36}$/);
  });

  it('ไฟล์จริงขนาด/ชนิดต่างจากที่ขอไว้ → Garage ปฏิเสธ (ถูกเซ็นไว้ใน URL)', async () => {
    const me = await staff();
    const ticket = await requestUpload(me.cookie, { sizeBytes: PDF.length + 10 });
    expect((await putToStorage(ticket.body.uploadUrl, ticket.body.headers, PDF)).status).toBe(403);
    const other = await requestUpload(me.cookie);
    expect((await putToStorage(other.body.uploadUrl, { 'Content-Type': 'image/png' }, PDF)).status).toBe(403);
  });

  it('ยืนยันก่อนอัปโหลดจริง → 409 (ไม่เชื่อคำบอกของ client)', async () => {
    const me = await staff();
    const ticket = await requestUpload(me.cookie);
    const res = await post(me.cookie, `/files/${ticket.body.fileId}/complete`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FILE_NOT_UPLOADED');
  });

  it('ชนิดไฟล์นอก allowlist / ใหญ่เกิน 10 MB → 422 ก่อนออก URL', async () => {
    const me = await staff();
    expect((await requestUpload(me.cookie, { mimeType: 'application/x-msdownload', fileName: 'a.exe' })).body.error.code).toBe(
      'FILE_TYPE_NOT_ALLOWED',
    );
    expect((await requestUpload(me.cookie, { sizeBytes: 10 * 1024 * 1024 + 1 })).body.error.code).toBe('FILE_TOO_LARGE');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM files');
    expect(rows[0].n).toBe(0);
  });

  it('ผู้ที่ไม่มีสิทธิ์ยื่นคำขอ (นิสิต) ขออัปโหลดใบคำยินยอมไม่ได้ (403), ไม่ login → 401', async () => {
    const student = await createTestUser({ email: '65010999001@msu.ac.th' });
    await grantRole(student.id, 'user');
    await grantRole(student.id, 'student');
    const cookie = await createSessionCookie(student.id);
    expect((await requestUpload(cookie)).status).toBe(403);
    expect((await request(app).post('/files/uploads').set('Origin', WEB_ORIGIN).send({})).status).toBe(401);
  });

  it('ผู้อื่นยืนยันหรือดาวน์โหลดไฟล์ของเราไม่ได้ (404)', async () => {
    const me = await staff();
    const stranger = await staff();
    const ticket = await requestUpload(me.cookie);
    await putToStorage(ticket.body.uploadUrl, ticket.body.headers, PDF);
    expect((await post(stranger.cookie, `/files/${ticket.body.fileId}/complete`)).status).toBe(404);
    await post(me.cookie, `/files/${ticket.body.fileId}/complete`);
    expect((await request(app).get(`/files/${ticket.body.fileId}/download-url`).set('Cookie', stranger.cookie)).status).toBe(404);
  });

  it('ไฟล์ที่ยังไม่ยืนยันการอัปโหลด ขอ URL ดาวน์โหลดไม่ได้', async () => {
    const me = await staff();
    const ticket = await requestUpload(me.cookie);
    expect((await request(app).get(`/files/${ticket.body.fileId}/download-url`).set('Cookie', me.cookie)).status).toBe(404);
  });
});
