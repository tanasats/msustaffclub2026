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
const PDF = new TextEncoder().encode('%PDF-1.4 เกียรติบัตร');

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

// อัปโหลดหลักฐานแบบเดียวกับ browser (Garage จริง)
async function uploadEvidence(who: Actor): Promise<string> {
  const ticket = await post(who, '/files/uploads', {
    purpose: 'achievement_evidence',
    fileName: 'เกียรติบัตร.pdf',
    mimeType: 'application/pdf',
    sizeBytes: PDF.length,
  });
  expect(ticket.status).toBe(201);
  expect((await fetch(ticket.body.uploadUrl, { method: 'PUT', headers: ticket.body.headers, body: PDF })).status).toBe(200);
  expect((await post(who, `/files/${ticket.body.fileId}/complete`)).status).toBe(200);
  return ticket.body.fileId as string;
}

const BASE = {
  title: 'รางวัลชนะเลิศการประกวดดนตรีไทย',
  achievedOn: '2026-08-15',
  level: 'national',
  category: 'competition',
  award: 'รางวัลชนะเลิศ',
  organizer: 'กระทรวงวัฒนธรรม',
};

// ชมรมที่มีเลขานุการ (รับรองได้) และสมาชิก 1 คน
async function setup() {
  const clubId = await createTestClub();
  const secretary = await actor();
  const member = await actor();
  await addMembership(clubId, secretary.id, 'active');
  await addCommittee(clubId, secretary.id, 'secretary');
  await addMembership(clubId, member.id, 'active');
  return { clubId, secretary, member };
}

async function submit(who: Actor, clubId: string, overrides: object = {}) {
  const res = await post(who, `/clubs/${clubId}/achievements`, { ...BASE, ...overrides });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function statusOf(id: string) {
  const { rows } = await pool.query<{ status: string; decided_by: string | null; decision_note: string | null }>(
    'SELECT status, decided_by, decision_note FROM club_achievements WHERE id = $1',
    [id],
  );
  return rows[0]!;
}

async function actionsOf(id: string) {
  const { rows } = await pool.query<{ action: string }>(
    'SELECT action FROM club_achievement_events WHERE achievement_id = $1 ORDER BY created_at, id',
    [id],
  );
  return rows.map((r) => r.action);
}

describe('บันทึกผลงาน', () => {
  it('สมาชิกบันทึกผลงานพร้อมไฟล์ → รอรับรอง ติดตามได้ใน "ผลงานของฉัน" แต่ยังไม่แสดงในหน้าชมรม', async () => {
    const { clubId, member } = await setup();
    const fileId = await uploadEvidence(member);

    const id = await submit(member, clubId, { fileIds: [fileId] });

    expect(await statusOf(id)).toMatchObject({ status: 'pending' });
    expect(await actionsOf(id)).toEqual(['submitted']);
    const mine = await get(member, '/me/achievements');
    expect(mine.body.items).toMatchObject([{ id, status: 'pending', clubId, title: BASE.title }]);
    expect((await get(member, `/clubs/${clubId}/achievements`)).body.items).toEqual([]);

    const detail = (await get(member, `/achievements/${id}`)).body;
    expect(detail.files).toMatchObject([{ fileId, originalName: 'เกียรติบัตร.pdf' }]);
    expect(detail.me).toMatchObject({ isOwner: true, canEdit: true, canReview: false });
  });

  it('ต้องเป็นสมาชิก active ของชมรมที่ดำเนินการอยู่', async () => {
    const { clubId } = await setup();
    const outsider = await actor();
    const pending = await actor();
    await addMembership(clubId, pending.id, 'pending');
    for (const who of [outsider, pending]) {
      expect((await post(who, `/clubs/${clubId}/achievements`, BASE)).body.error.code).toBe('NOT_ACTIVE_MEMBER');
    }
    const suspended = await createTestClub({ status: 'suspended' });
    await addMembership(suspended, outsider.id, 'active');
    expect((await post(outsider, `/clubs/${suspended}/achievements`, BASE)).body.error.code).toBe('CLUB_NOT_ACTIVE');
  });

  it('ตรวจข้อมูล: วันที่ในอนาคต, ระดับ/ประเภทไม่ถูกต้อง, ไฟล์เกิน 5 ไฟล์', async () => {
    const { clubId, member } = await setup();
    const path = `/clubs/${clubId}/achievements`;
    expect((await post(member, path, { ...BASE, achievedOn: '2099-01-01' })).body.error.code).toBe('ACHIEVED_ON_IN_FUTURE');
    expect((await post(member, path, { ...BASE, level: 'galaxy' })).status).toBe(400);
    expect((await post(member, path, { ...BASE, category: 'sport' })).status).toBe(400);
    const six = Array.from({ length: 6 }, () => '01900000-0000-7000-8000-000000000000');
    expect((await post(member, path, { ...BASE, fileIds: six })).status).toBe(400);
  });

  it('แนบไฟล์ของคนอื่น หรือไฟล์ที่แนบกับผลงานอื่นอยู่แล้ว ไม่ได้', async () => {
    const { clubId, secretary, member } = await setup();
    const othersFile = await uploadEvidence(secretary);
    expect((await post(member, `/clubs/${clubId}/achievements`, { ...BASE, fileIds: [othersFile] })).body.error.code).toBe(
      'FILE_NOT_ATTACHABLE',
    );
    const mine = await uploadEvidence(member);
    await submit(member, clubId, { fileIds: [mine] });
    expect((await post(member, `/clubs/${clubId}/achievements`, { ...BASE, fileIds: [mine] })).body.error.code).toBe(
      'FILE_ALREADY_ATTACHED',
    );
  });
});

describe('กรรมการรับรอง', () => {
  it('กรรมการเห็นคิวและรับรองได้ → แสดงในหน้าชมรม ผู้อื่นเห็นรายละเอียดแต่ไม่เห็นไฟล์/ประวัติ', async () => {
    const { clubId, secretary, member } = await setup();
    const outsider = await actor();
    const fileId = await uploadEvidence(member);
    const id = await submit(member, clubId, { fileIds: [fileId] });

    expect((await get(outsider, `/achievements/${id}`)).status).toBe(404);
    const queue = await get(secretary, `/clubs/${clubId}/achievement-reviews`);
    expect(queue.body.items.map((a: { id: string }) => a.id)).toEqual([id]);
    expect((await get(secretary, `/achievements/${id}`)).body.me.canReview).toBe(true);

    expect((await post(secretary, `/achievements/${id}/review`, { decision: 'approve' })).status).toBe(204);

    expect(await statusOf(id)).toMatchObject({ status: 'approved', decided_by: secretary.id });
    expect(await actionsOf(id)).toEqual(['submitted', 'approved']);
    expect((await get(outsider, `/clubs/${clubId}/achievements`)).body.items.map((a: { id: string }) => a.id)).toEqual([id]);
    const publicView = (await get(outsider, `/achievements/${id}`)).body;
    expect(publicView).toMatchObject({ id, status: 'approved', title: BASE.title });
    expect(publicView).not.toHaveProperty('files');
    expect(publicView).not.toHaveProperty('events');

    // ไฟล์แนบ: เจ้าของและกรรมการเปิดได้ คนอื่นไม่พบ
    expect((await get(outsider, `/files/${fileId}/download-url`)).status).toBe(404);
    expect((await get(secretary, `/files/${fileId}/download-url`)).status).toBe(200);
    expect((await get(member, `/files/${fileId}/download-url`)).status).toBe(200);
    // รับรองแล้วแก้ไข/ถอนไม่ได้
    expect((await put(member, `/achievements/${id}`, BASE)).body.error.code).toBe('ACHIEVEMENT_NOT_EDITABLE');
    expect((await post(member, `/achievements/${id}/withdraw`)).body.error.code).toBe('ACHIEVEMENT_NOT_EDITABLE');
  });

  it('สมาชิกทั่วไปและกรรมการชมรมอื่นไม่พบผลงานที่รอรับรอง, เจ้าหน้าที่ (club:read_all) ดูได้แต่รับรองไม่ได้', async () => {
    const { clubId, member } = await setup();
    const other = await setup();
    const plain = await actor();
    await addMembership(clubId, plain.id, 'active');
    const id = await submit(member, clubId);

    for (const who of [plain, other.secretary]) {
      expect((await post(who, `/achievements/${id}/review`, { decision: 'approve' })).status).toBe(404);
    }
    expect((await get(plain, `/clubs/${clubId}/achievement-reviews`)).status).toBe(403);

    // role ทดสอบที่มี club:read_all (เจ้าหน้าที่ดูทุกชมรม)
    const { rows } = await pool.query<{ id: string }>(
      `WITH r AS (INSERT INTO roles (code, name_th) VALUES ('test_reader', 'ทดสอบอ่านทุกชมรม') RETURNING id)
       INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM r, permissions p WHERE p.code = 'club:read_all' RETURNING role_id AS id`,
    );
    expect(rows).toHaveLength(1);
    const reader = await actor(['user', 'staff', 'test_reader']);
    expect((await get(reader, `/achievements/${id}`)).body.files).toEqual([]);
    expect((await post(reader, `/achievements/${id}/review`, { decision: 'approve' })).status).toBe(403);
  });

  it('รับรองผลงานของตัวเองไม่ได้', async () => {
    const { clubId, secretary } = await setup();
    const id = await submit(secretary, clubId);
    const res = await post(secretary, `/achievements/${id}/review`, { decision: 'approve' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_REVIEW_OWN_ACHIEVEMENT');
  });

  it('ส่งกลับต้องมีเหตุผล → เจ้าของแก้แล้วส่งใหม่ (resubmitted) → ไม่รับรองพร้อมเหตุผล', async () => {
    const { clubId, secretary, member } = await setup();
    const id = await submit(member, clubId);

    expect((await post(secretary, `/achievements/${id}/review`, { decision: 'return' })).body.error.code).toBe('NOTE_REQUIRED');
    expect((await post(secretary, `/achievements/${id}/review`, { decision: 'return', note: 'แนบเกียรติบัตรด้วย' })).status).toBe(204);
    expect(await statusOf(id)).toMatchObject({ status: 'returned', decision_note: 'แนบเกียรติบัตรด้วย' });
    expect((await get(member, `/achievements/${id}`)).body).toMatchObject({ decisionNote: 'แนบเกียรติบัตรด้วย', me: { canEdit: true } });

    const fileId = await uploadEvidence(member);
    expect((await put(member, `/achievements/${id}`, { ...BASE, title: 'ชนะเลิศ (แก้ไข)', fileIds: [fileId] })).status).toBe(204);
    expect(await statusOf(id)).toMatchObject({ status: 'pending' });

    expect((await post(secretary, `/achievements/${id}/review`, { decision: 'reject', note: 'ไม่ใช่ผลงานในนามชมรม' })).status).toBe(204);
    expect(await actionsOf(id)).toEqual(['submitted', 'returned', 'resubmitted', 'rejected']);
    const events = (await get(member, `/achievements/${id}`)).body.events;
    expect(events.at(-1)).toMatchObject({ action: 'rejected', note: 'ไม่ใช่ผลงานในนามชมรม' });
  });

  it('ถอนผลงานแล้วรับรองไม่ได้', async () => {
    const { clubId, secretary, member } = await setup();
    const id = await submit(member, clubId);
    expect((await post(member, `/achievements/${id}/withdraw`, { note: 'บันทึกผิดชมรม' })).status).toBe(204);
    expect(await statusOf(id)).toMatchObject({ status: 'withdrawn' });
    expect((await post(secretary, `/achievements/${id}/review`, { decision: 'approve' })).status).toBe(409);
  });
});

describe('ไฟล์แนบและประวัติ', () => {
  it('แก้ไขแล้วเอาไฟล์ออก → ไฟล์นั้นถูกลบจากที่เก็บ ไฟล์ที่ยังแนบอยู่ไม่ถูกลบ', async () => {
    const { clubId, member } = await setup();
    const [keep, drop] = [await uploadEvidence(member), await uploadEvidence(member)];
    const id = await submit(member, clubId, { fileIds: [keep, drop] });

    expect((await put(member, `/achievements/${id}`, { ...BASE, fileIds: [keep] })).status).toBe(204);

    const { rows } = await pool.query<{ id: string; object_key: string; deleted: boolean }>(
      'SELECT id, object_key, deleted_at IS NOT NULL AS deleted FROM files WHERE id = ANY($1::uuid[])',
      [[keep, drop]],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(drop)!.deleted).toBe(true);
    expect(await storage.headObject(byId.get(drop)!.object_key)).toBeNull();
    expect(byId.get(keep)!.deleted).toBe(false);
    expect((await get(member, `/achievements/${id}`)).body.files.map((f: { fileId: string }) => f.fileId)).toEqual([keep]);
    expect(await actionsOf(id)).toEqual(['submitted', 'updated']);
  });

  it('ประวัติผลงานแก้/ลบไม่ได้', async () => {
    const { clubId, member } = await setup();
    await submit(member, clubId);
    await expect(pool.query("UPDATE club_achievement_events SET note = 'x'")).rejects.toThrow(/ห้ามแก้ไขหรือลบ/);
  });
});
