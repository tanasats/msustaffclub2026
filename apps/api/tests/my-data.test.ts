import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { createTestUser, resetDatabase } from './helpers/db.js';
import { createSessionCookie, grantRole } from './helpers/auth.js';
import { addAdvisor, addCommittee, addMembership, createTestClub } from './helpers/clubs.js';
import { request } from './helpers/http.js';

beforeEach(resetDatabase);

const app = createApp();

async function actor(email: string, name: string) {
  const user = await createTestUser({ email });
  await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, name]);
  await grantRole(user.id, 'user');
  await grantRole(user.id, 'staff');
  return { ...user, cookie: await createSessionCookie(user.id) };
}

const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

// ข้อมูลของผู้ใช้ 1 คนในทุกกลุ่ม (ใช้ป้ายชื่อ tag เพื่อตรวจว่าไม่ปนกับของผู้อื่น)
async function seedPerson(userId: string, tag: string, clubId: string, running: string, statId: string) {
  await addMembership(clubId, userId);
  await addCommittee(clubId, userId, tag === 'A' ? 'president' : 'secretary');
  await q('UPDATE club_committee_members SET contact_phone = $2, bio = $3 WHERE user_id = $1', [userId, `08${tag}`, `ประวัติ ${tag}`]);
  await q(
    `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status) VALUES ('establish', 2570, $1, $2, 'draft')`,
    [userId, `ชมรมของ ${tag}`],
  );
  await q(
    `INSERT INTO club_achievements (club_id, user_id, title, achieved_on, level, category, status)
     VALUES ($1, $2, $3, DATE '2026-08-01', 'university', 'competition', 'pending')`,
    [clubId, userId, `ผลงาน ${tag}`],
  );
  const { rows: act } = await q(
    `INSERT INTO club_activities (club_id, held_on, title, recorded_by) VALUES ($1, DATE '2026-08-02', $2, $3) RETURNING id`,
    [clubId, `กิจกรรม ${tag}`, userId],
  );
  await q('INSERT INTO club_activity_participants (activity_id, user_id) VALUES ($1, $2)', [act[0].id, userId]);
  await q('INSERT INTO club_athletes (club_id, user_id, sport_id, event_or_position) VALUES ($1, $2, $3, $4)', [clubId, userId, running, `10 กม. ${tag}`]);
  const { rows: comp } = await q(
    `INSERT INTO sport_competitions (club_id, sport_id, title, level, held_from, recorded_by)
     VALUES ($1, $2, $3, 'university', DATE '2026-08-03', $4) RETURNING id`,
    [clubId, running, `แข่ง ${tag}`, userId],
  );
  const { rows: res } = await q(
    `INSERT INTO sport_competition_results (competition_id, user_id, rank, medal) VALUES ($1, $2, 1, 'gold') RETURNING id`,
    [comp[0].id, userId],
  );
  await q('INSERT INTO sport_result_stats (result_id, stat_definition_id, value) VALUES ($1, $2, 42.5)', [res[0].id, statId]);
  await q(
    `INSERT INTO files (bucket, object_key, original_name, mime_type, size_bytes, purpose, status, uploaded_at, uploaded_by)
     VALUES ('b', $1, $2, 'image/png', 10, 'activity_photo', 'uploaded', now(), $3)`,
    [`k-${tag}`, `รูป ${tag}.png`, userId],
  );
  await q(
    `INSERT INTO email_outbox (kind, dedupe_key, recipient_user_id, recipient_email, subject, body_text, body_html)
     SELECT 'advisor_nominated', $2, id, email, $3, 'x', 'x' FROM users WHERE id = $1`,
    [userId, `d-${tag}`, `อีเมลถึง ${tag}`],
  );
  await q(`INSERT INTO privacy_notice_acknowledgements (user_id, notice_version) VALUES ($1, '1.0')`, [userId]);
}

describe('GET /me/data — ข้อมูลของฉัน (สิทธิขอเข้าถึง/รับสำเนา)', () => {
  it('คืนข้อมูลของผู้ขอครบทุกกลุ่ม และไม่ปนข้อมูลของผู้ใช้อื่น', async () => {
    const a = await actor('a.person@msu.ac.th', 'เอ ทดสอบ');
    const b = await actor('b.person@msu.ac.th', 'บี ทดสอบ');
    const clubId = await createTestClub({ name: 'ชมรมวิ่ง' });
    await addAdvisor(clubId, a.id);
    const { rows: sport } = await q(`SELECT id FROM sports WHERE code = 'running'`);
    const { rows: stat } = await q(
      `INSERT INTO sport_stat_definitions (sport_id, code, name_th, unit, better) VALUES ($1, 'test_time', 'เวลา', 'นาที', 'lower') RETURNING id`,
      [sport[0].id],
    );
    await seedPerson(a.id, 'A', clubId, sport[0].id, stat[0].id);
    await seedPerson(b.id, 'B', clubId, sport[0].id, stat[0].id);

    const res = await request(app).get('/me/data').set('Cookie', a.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const d = res.body;
    expect(d.account).toMatchObject({ email: 'a.person@msu.ac.th', name: 'เอ ทดสอบ' });
    expect(d.account.roles.map((r: { code: string }) => r.code)).toEqual(['staff', 'user']);
    expect(d.dpoContact).toContain('dpo@msu.ac.th');
    expect(d.privacyAcknowledgements).toMatchObject([{ version: '1.0' }]);
    expect(d.memberships).toMatchObject([{ clubName: 'ชมรมวิ่ง', status: 'active' }]);
    expect(d.committeePositions).toMatchObject([{ clubName: 'ชมรมวิ่ง', contactPhone: '08A', bio: 'ประวัติ A' }]);
    expect(d.advisorships).toMatchObject([{ clubName: 'ชมรมวิ่ง' }]);
    expect(d.applications).toMatchObject([{ nameTh: 'ชมรมของ A', status: 'draft' }]);
    expect(d.achievements).toMatchObject([{ title: 'ผลงาน A', achievedOn: '2026-08-01' }]);
    expect(d.activityParticipation).toMatchObject([{ title: 'กิจกรรม A', heldOn: '2026-08-02' }]);
    expect(d.athleteRecords).toMatchObject([{ sportName: 'วิ่ง', eventOrPosition: '10 กม. A' }]);
    expect(d.competitionResults).toMatchObject([{ title: 'แข่ง A', rank: 1, medal: 'gold', stats: [{ name: 'เวลา', value: 42.5, unit: 'นาที' }] }]);
    expect(d.uploadedFiles).toMatchObject([{ originalName: 'รูป A.png', purpose: 'activity_photo' }]);
    expect(d.emails).toMatchObject([{ subject: 'อีเมลถึง A' }]);
    expect(d.sessions.active).toBe(1);

    // ไม่มีข้อมูลของ B ปนอยู่ที่ใดเลย
    const raw = JSON.stringify(d);
    for (const leak of ['b.person@msu.ac.th', 'บี ทดสอบ', '08B', 'ประวัติ B', 'ชมรมของ B', 'ผลงาน B', 'กิจกรรม B', 'แข่ง B', 'รูป B', 'อีเมลถึง B']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('ข้อมูลในคำขอของผู้อื่น: ถูกเสนอเป็นที่ปรึกษา (รวมเสนอด้วยอีเมลก่อน login) และถูกระบุเป็นกรรมการ', async () => {
    const applicant = await actor('applicant@msu.ac.th', 'ผู้ยื่น');
    const me = await actor('me@msu.ac.th', 'ฉัน');
    const { rows } = await q(
      `INSERT INTO club_applications (type, fiscal_year, applicant_user_id, name_th, status) VALUES ('establish', 2570, $1, 'ชมรมดนตรี', 'awaiting_consent') RETURNING id`,
      [applicant.id],
    );
    await q(`INSERT INTO club_application_advisors (application_id, email, sort_order) VALUES ($1, 'me@msu.ac.th', 1)`, [rows[0].id]);
    await q(
      `INSERT INTO club_application_committee (application_id, user_id, position_id, position_title, sort_order, contact_phone)
       SELECT $1, $2, id, 'เลขานุการ', 1, '0899999999' FROM club_positions WHERE code = 'secretary'`,
      [rows[0].id, me.id],
    );
    const d = (await request(app).get('/me/data').set('Cookie', me.cookie)).body;
    expect(d.applicationRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ applicationName: 'ชมรมดนตรี', role: 'advisor', detail: 'pending' }),
        expect.objectContaining({ applicationName: 'ชมรมดนตรี', role: 'committee', detail: 'เลขานุการ', contactPhone: '0899999999' }),
      ]),
    );
    expect(d.applications).toEqual([]); // ไม่ใช่ผู้ยื่น
  });

  it('ผลการคัดเลือก: แสดงเฉพาะรอบที่ประกาศผลแล้ว (รอบที่ยังพิจารณาไม่แสดง)', async () => {
    const me = await actor('athlete@msu.ac.th', 'นักกีฬา');
    const admin = await actor('admin@msu.ac.th', 'ผู้ดูแล');
    for (const [title, status] of [
      ['รอบประกาศแล้ว', 'closed'],
      ['รอบที่ยังพิจารณา', 'open'],
    ]) {
      const { rows } = await q(
        `INSERT INTO selection_rounds (kind, title, fiscal_year, created_by) VALUES ('award', $1, 2569, $2) RETURNING id`,
        [title, admin.id],
      );
      await q(
        `INSERT INTO selection_candidates (round_id, user_id, decision, reason, decided_by) VALUES ($1, $2, 'selected', 'ผลงานดีเด่น', $3)`,
        [rows[0].id, me.id, admin.id],
      );
      if (status === 'closed') await q(`UPDATE selection_rounds SET status = 'closed', closed_by = $2, closed_at = now() WHERE id = $1`, [rows[0].id, admin.id]);
    }
    const d = (await request(app).get('/me/data').set('Cookie', me.cookie)).body;
    expect(d.selectionResults).toMatchObject([{ roundTitle: 'รอบประกาศแล้ว', decision: 'selected', reason: 'ผลงานดีเด่น' }]);
  });

  it('ต้อง login', async () => {
    expect((await request(app).get('/me/data')).status).toBe(401);
  });
});
