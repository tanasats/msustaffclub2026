import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import type { Queryable } from '../db/pool.js';
import { composeEmail, type EmailContent } from '../mail/templates.js';
import { insertOutboxEmails } from '../repositories/email-outbox-repository.js';
import {
  getApplicationNotice,
  getMonthlyReportNotice,
  listCurrentAdvisorUsers,
  listPendingInternalAdvisors,
  listUsersWithPermission,
  type ApplicationNotice,
  type Recipient,
} from '../repositories/notification-recipients-repository.js';
import { NOTIFICATION_EVENTS, type NotificationEvent } from './notification-events.js';
import { PERMISSIONS } from './permissions.js';
import { getEmailSettings } from './system-settings-service.js';

/**
 * อีเมลแจ้งเตือน: ทุกฟังก์ชันรับ db ของ transaction ที่เกิดเหตุการณ์ แล้ว "ใส่คิว" (email_outbox) เท่านั้น
 * — เหตุการณ์ rollback อีเมลก็หายไปด้วย, การส่งจริงทำโดย worker ภายหลัง (ส่งไม่ได้ก็ไม่กระทบรายการหลัก)
 * — สวิตช์หลักหรือสวิตช์ของเหตุการณ์ปิด = ไม่ใส่คิว
 * eventKey: ตัวระบุเหตุการณ์ (เช่น id ของ event log) ใช้ประกอบ dedupe_key กันแจ้งซ้ำ
 */

const link = (path: string) => new URL(path, config.webUrl).toString();

function clubLabel(notice: ApplicationNotice): string {
  const name = notice.nameTh.startsWith('ชมรม') ? notice.nameTh : `ชมรม${notice.nameTh}`;
  return notice.type === 'renewal' ? `คำขอต่อทะเบียน${name}` : `คำขอจัดตั้ง${name}`;
}

async function enqueue(
  db: Queryable,
  event: NotificationEvent,
  eventKey: string,
  recipients: Recipient[],
  render: (recipient: Recipient) => EmailContent,
): Promise<void> {
  if (recipients.length === 0) return;
  const settings = await getEmailSettings(db);
  if (!settings.enabled || !settings.events[event]) return;
  await insertOutboxEmails(
    recipients.map((recipient) => {
      const content = render(recipient);
      return {
        kind: event,
        dedupeKey: `${event}:${eventKey}:${recipient.email.toLowerCase()}`,
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        subject: content.subject,
        bodyText: content.text,
        bodyHtml: content.html,
      };
    }),
    db,
  );
}

// ผู้ยื่นขอความยินยอม → ที่ปรึกษาที่ยังไม่ตอบ
export async function notifyAdvisorsNominated(db: Queryable, applicationId: string, eventKey: string): Promise<void> {
  const notice = await getApplicationNotice(applicationId, db);
  if (!notice) return;
  const advisors = await listPendingInternalAdvisors(applicationId, db);
  await enqueue(db, NOTIFICATION_EVENTS.ADVISOR_NOMINATED, eventKey, advisors, (advisor) =>
    composeEmail({
      subject: `ขอความยินยอมเป็นที่ปรึกษา — ${clubLabel(notice)}`,
      recipientName: advisor.name,
      paragraphs: [
        `${notice.applicant.name ?? 'ผู้ยื่นคำขอ'} เสนอชื่อคุณเป็นที่ปรึกษาใน${clubLabel(notice)}`,
        'กรุณาเข้าสู่ระบบด้วยบัญชี @msu.ac.th เพื่ออ่านรายละเอียดของชมรม แล้วตอบยินยอมหรือปฏิเสธ ชมรมจะยื่นคำขอต่อสโมสรได้เมื่อที่ปรึกษายินยอมครบ',
      ],
      actionLabel: 'อ่านรายละเอียดและตอบคำขอ',
      actionUrl: link(`/club-applications/${notice.id}`),
    }),
  );
}

// ที่ปรึกษาตอบ → ผู้ยื่น
export async function notifyAdvisorResponded(
  db: Queryable,
  applicationId: string,
  advisorName: string,
  decision: 'accept' | 'decline',
): Promise<void> {
  const notice = await getApplicationNotice(applicationId, db);
  if (!notice || !notice.applicantActive) return;
  const accepted = decision === 'accept';
  await enqueue(db, NOTIFICATION_EVENTS.ADVISOR_RESPONDED, randomUUID(), [notice.applicant], (applicant) =>
    composeEmail({
      subject: `ที่ปรึกษา${accepted ? 'ยินยอม' : 'ปฏิเสธ'} — ${clubLabel(notice)}`,
      recipientName: applicant.name,
      paragraphs: accepted
        ? [`${advisorName} ยินยอมเป็นที่ปรึกษาใน${clubLabel(notice)}แล้ว`, 'เมื่อที่ปรึกษายินยอมครบทุกคน คุณยื่นคำขอต่อสโมสรบุคลากรได้ทันที']
        : [`${advisorName} ปฏิเสธการเป็นที่ปรึกษาใน${clubLabel(notice)}`, 'คำขอกลับเป็นฉบับร่าง กรุณาดูเหตุผล แก้ไขรายชื่อที่ปรึกษา แล้วขอความยินยอมใหม่'],
      actionLabel: 'เปิดคำขอ',
      actionUrl: link(`/club-applications/${notice.id}`),
    }),
  );
}

const RESULT_TEXT = {
  returned: { title: 'ถูกส่งกลับให้แก้ไข', next: 'กรุณาแก้ไขตามเหตุผลด้านล่าง แล้วขอความยินยอมจากที่ปรึกษาและยื่นใหม่อีกครั้ง' },
  approved: { title: 'ได้รับการอนุมัติแล้ว', next: 'ชมรมพร้อมใช้งานในระบบ เริ่มรับสมาชิกและบันทึกกิจกรรมได้ทันที' },
  rejected: { title: 'ไม่ได้รับการอนุมัติ', next: 'ดูเหตุผลด้านล่าง หากมีข้อสงสัยกรุณาติดต่อสโมสรบุคลากร' },
} as const;

// ผลการพิจารณา → ผู้ยื่น
export async function notifyApplicationResult(
  db: Queryable,
  applicationId: string,
  result: keyof typeof RESULT_TEXT,
  note: string | null,
  eventKey: string,
): Promise<void> {
  const notice = await getApplicationNotice(applicationId, db);
  if (!notice || !notice.applicantActive) return;
  const text = RESULT_TEXT[result];
  await enqueue(db, NOTIFICATION_EVENTS.APPLICATION_RESULT, eventKey, [notice.applicant], (applicant) =>
    composeEmail({
      subject: `${clubLabel(notice)} ${text.title}`,
      recipientName: applicant.name,
      paragraphs: [`${clubLabel(notice)}ของคุณ${text.title}`, text.next, ...(note ? [`เหตุผล/หมายเหตุ: ${note}`] : [])],
      actionLabel: 'เปิดคำขอ',
      actionUrl: link(`/club-applications/${notice.id}`),
    }),
  );
}

// คำขอเข้าคิว → ผู้ตรวจ (submitted) หรือผู้อนุมัติ (reviewed)
export async function notifyApplicationQueue(
  db: Queryable,
  applicationId: string,
  stage: 'submitted' | 'reviewed',
  actorUserId: string,
  eventKey: string,
): Promise<void> {
  const notice = await getApplicationNotice(applicationId, db);
  if (!notice) return;
  const permission = stage === 'submitted' ? PERMISSIONS.CLUB_APPLICATION_REVIEW : PERMISSIONS.CLUB_APPLICATION_APPROVE;
  const officers = await listUsersWithPermission(permission, actorUserId, db);
  const waiting = stage === 'submitted' ? 'รอตรวจ' : 'ตรวจผ่านแล้ว รออนุมัติ';
  await enqueue(db, NOTIFICATION_EVENTS.APPLICATION_QUEUE, eventKey, officers, (officer) =>
    composeEmail({
      subject: `${clubLabel(notice)} ${waiting}`,
      recipientName: officer.name,
      paragraphs: [`${clubLabel(notice)} (ผู้ยื่น: ${notice.applicant.name ?? notice.applicant.email}) ${waiting}`],
      actionLabel: 'เปิดกล่องงาน',
      actionUrl: link(`/club-applications/${notice.id}`),
    }),
  );
}

const thaiMonth = (date: string) =>
  new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

// ชมรมส่งรายงานประจำเดือน → ที่ปรึกษาของชมรม
export async function notifyMonthlyReportSubmitted(db: Queryable, reportId: string): Promise<void> {
  const report = await getMonthlyReportNotice(reportId, db);
  if (!report) return;
  const advisors = await listCurrentAdvisorUsers(report.clubId, db);
  await enqueue(db, NOTIFICATION_EVENTS.MONTHLY_REPORT_SUBMITTED, reportId, advisors, (advisor) =>
    composeEmail({
      subject: `${report.clubName} ส่งรายงานประจำเดือน${thaiMonth(report.reportMonth)}`,
      recipientName: advisor.name,
      paragraphs: [
        `${report.clubName} ส่งรายงานผลการดำเนินงานประจำเดือน${thaiMonth(report.reportMonth)} ให้คุณในฐานะที่ปรึกษาชมรม`,
        'กรุณาเข้าระบบเพื่ออ่านรายงานและกดรับทราบ (ใส่ความเห็นได้)',
      ],
      actionLabel: 'อ่านรายงาน',
      actionUrl: link(`/monthly-reports/${report.id}`),
    }),
  );
}
