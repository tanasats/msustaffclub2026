import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import type { Queryable } from '../db/pool.js';
import { composeEmail } from '../mail/templates.js';
import { insertOutboxEmails } from '../repositories/email-outbox-repository.js';
import { insertNotifications } from '../repositories/notifications-repository.js';
import { findEmailOptOutUserIds } from '../repositories/preferences-repository.js';
import {
  getApplicationNotice,
  getMonthlyReportNotice,
  getMembershipNotice,
  listClubPermissionHolders,
  listCurrentAdvisorUsers,
  listPendingCommitteeNominees,
  listPendingInternalAdvisors,
  listUsersWithPermission,
  type ApplicationNotice,
  type Recipient,
} from '../repositories/notification-recipients-repository.js';
import { NOTIFICATION_EVENTS, type NotificationEvent } from './notification-events.js';
import { PERMISSIONS } from './permissions.js';
import { getEmailSettings } from './system-settings-service.js';

/**
 * การแจ้งเตือน: ทุกฟังก์ชันรับ db ของ transaction ที่เกิดเหตุการณ์ แล้วบันทึกใน transaction เดียวกัน
 * — เหตุการณ์ rollback การแจ้งเตือนก็หายไปด้วย
 * — ในระบบ (ตาราง notifications): ผู้รับที่มีบัญชีได้รับเสมอ ไม่ขึ้นกับสวิตช์อีเมล
 * — อีเมล (คิว email_outbox, worker ส่งภายหลัง): สวิตช์หลักหรือสวิตช์ของเหตุการณ์ปิด = ไม่ใส่คิว,
 *   ผู้รับที่ปิดรับอีเมลในหน้าตั้งค่า (user_preferences.email_notifications = false) = ไม่ใส่คิวให้คนนั้น
 * eventKey: ตัวระบุเหตุการณ์ (เช่น id ของ event log) ใช้ประกอบ dedupe_key กันแจ้งซ้ำ
 */

const link = (path: string) => new URL(path, config.webUrl).toString();

// เนื้อหา 1 เรื่อง ใช้ทำทั้งอีเมลและการแจ้งเตือนในระบบ — actionPath เป็น path ภายในเว็บ (ขึ้นต้นด้วย /)
interface NoticeContent {
  subject: string;
  paragraphs: string[];
  actionLabel: string;
  actionPath: string;
}

function clubLabel(notice: ApplicationNotice): string {
  const name = notice.nameTh.startsWith('ชมรม') ? notice.nameTh : `ชมรม${notice.nameTh}`;
  return notice.type === 'renewal' ? `คำขอต่อทะเบียน${name}` : `คำขอจัดตั้ง${name}`;
}

async function enqueue(
  db: Queryable,
  event: NotificationEvent,
  eventKey: string,
  recipients: Recipient[],
  content: NoticeContent,
): Promise<void> {
  if (recipients.length === 0) return;
  const userIds = [...new Set(recipients.flatMap((recipient) => (recipient.userId ? [recipient.userId] : [])))];
  await insertNotifications(
    userIds.map((userId) => ({
      userId,
      kind: event,
      dedupeKey: `${event}:${eventKey}:${userId}`,
      title: content.subject,
      body: content.paragraphs.join('\n'),
      linkPath: content.actionPath,
    })),
    db,
  );

  const settings = await getEmailSettings(db);
  if (!settings.enabled || !settings.events[event]) return;
  const optedOut = await findEmailOptOutUserIds(userIds, db);
  // ผู้รับที่ไม่มีบัญชี (ยังไม่เคยเข้าระบบ) ตั้งค่าเองไม่ได้ จึงได้รับอีเมลตามปกติ
  const emailRecipients = recipients.filter((recipient) => !recipient.userId || !optedOut.has(recipient.userId));
  await insertOutboxEmails(
    emailRecipients.map((recipient) => {
      const email = composeEmail({
        subject: content.subject,
        recipientName: recipient.name,
        paragraphs: content.paragraphs,
        actionLabel: content.actionLabel,
        actionUrl: link(content.actionPath),
      });
      return {
        kind: event,
        dedupeKey: `${event}:${eventKey}:${recipient.email.toLowerCase()}`,
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        subject: email.subject,
        bodyText: email.text,
        bodyHtml: email.html,
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
  await enqueue(db, NOTIFICATION_EVENTS.ADVISOR_NOMINATED, eventKey, advisors, {
    subject: `ขอความยินยอมเป็นที่ปรึกษา — ${clubLabel(notice)}`,
    paragraphs: [
      `${notice.applicant.name ?? 'ผู้ยื่นคำขอ'} เสนอชื่อคุณเป็นที่ปรึกษาใน${clubLabel(notice)}`,
      'กรุณาเข้าสู่ระบบด้วยบัญชี @msu.ac.th เพื่ออ่านรายละเอียดของชมรม แล้วตอบยินยอมหรือปฏิเสธ ชมรมจะยื่นคำขอต่อสโมสรได้เมื่อที่ปรึกษายินยอมครบ',
    ],
    actionLabel: 'อ่านรายละเอียดและตอบคำขอ',
    actionPath: `/club-applications/${notice.id}`,
  });
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
  await enqueue(db, NOTIFICATION_EVENTS.ADVISOR_RESPONDED, randomUUID(), [notice.applicant], {
    subject: `ที่ปรึกษา${accepted ? 'ยินยอม' : 'ปฏิเสธ'} — ${clubLabel(notice)}`,
    paragraphs: accepted
      ? [`${advisorName} ยินยอมเป็นที่ปรึกษาใน${clubLabel(notice)}แล้ว`, 'เมื่อที่ปรึกษายินยอมครบทุกคน คุณยื่นคำขอต่อสโมสรบุคลากรได้ทันที']
      : [`${advisorName} ปฏิเสธการเป็นที่ปรึกษาใน${clubLabel(notice)}`, 'คำขอกลับเป็นฉบับร่าง กรุณาดูเหตุผล แก้ไขรายชื่อที่ปรึกษา แล้วขอความยินยอมใหม่'],
    actionLabel: 'เปิดคำขอ',
    actionPath: `/club-applications/${notice.id}`,
  });
}

// ผู้ยื่นขอความยินยอม → ผู้ถูกเสนอเป็นประธานที่ยังไม่ตอบ
export async function notifyPresidentNominated(db: Queryable, applicationId: string, eventKey: string): Promise<void> {
  const notice = await getApplicationNotice(applicationId, db);
  if (!notice) return;
  const nominees = await listPendingCommitteeNominees(applicationId, db);
  await enqueue(db, NOTIFICATION_EVENTS.PRESIDENT_NOMINATED, eventKey, nominees, {
    subject: `ขอการตอบรับเป็นประธานชมรม — ${clubLabel(notice)}`,
    paragraphs: [
      `${notice.applicant.name ?? 'ผู้ยื่นคำขอ'} เสนอชื่อคุณเป็นประธานใน${clubLabel(notice)}`,
      'กรุณาเข้าสู่ระบบเพื่ออ่านรายละเอียดของชมรม แล้วตอบรับหรือปฏิเสธ ในแบบคำขอจะระบุคุณเป็นผู้ขอจัดตั้งในฐานะประธานชมรม และชมรมจะยื่นคำขอต่อสโมสรได้เมื่อคุณตอบรับแล้ว',
    ],
    actionLabel: 'อ่านรายละเอียดและตอบรับ',
    actionPath: `/club-applications/${notice.id}`,
  });
}

// ผู้ถูกเสนอเป็นประธานตอบ → ผู้ยื่น
export async function notifyPresidentResponded(
  db: Queryable,
  applicationId: string,
  presidentName: string,
  decision: 'accept' | 'decline',
  eventKey: string,
): Promise<void> {
  const notice = await getApplicationNotice(applicationId, db);
  if (!notice || !notice.applicantActive) return;
  const accepted = decision === 'accept';
  await enqueue(db, NOTIFICATION_EVENTS.PRESIDENT_RESPONDED, eventKey, [notice.applicant], {
    subject: `ผู้ถูกเสนอเป็นประธาน${accepted ? 'ตอบรับ' : 'ปฏิเสธ'} — ${clubLabel(notice)}`,
    paragraphs: accepted
      ? [`${presidentName} ตอบรับเป็นประธานใน${clubLabel(notice)}แล้ว`, 'เมื่อที่ปรึกษายินยอมครบทุกคน คุณยื่นคำขอต่อสโมสรบุคลากรได้ทันที']
      : [`${presidentName} ปฏิเสธการเป็นประธานใน${clubLabel(notice)}`, 'คำขอกลับเป็นฉบับร่าง กรุณาดูเหตุผล เลือกประธานใหม่ แล้วส่งขอการตอบรับอีกครั้ง'],
    actionLabel: 'เปิดคำขอ',
    actionPath: `/club-applications/${notice.id}`,
  });
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
  await enqueue(db, NOTIFICATION_EVENTS.APPLICATION_RESULT, eventKey, [notice.applicant], {
    subject: `${clubLabel(notice)} ${text.title}`,
    paragraphs: [`${clubLabel(notice)}ของคุณ${text.title}`, text.next, ...(note ? [`เหตุผล/หมายเหตุ: ${note}`] : [])],
    actionLabel: 'เปิดคำขอ',
    actionPath: `/club-applications/${notice.id}`,
  });
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
  await enqueue(db, NOTIFICATION_EVENTS.APPLICATION_QUEUE, eventKey, officers, {
    subject: `${clubLabel(notice)} ${waiting}`,
    paragraphs: [`${clubLabel(notice)} (ผู้ยื่น: ${notice.applicant.name ?? notice.applicant.email}) ${waiting}`],
    actionLabel: 'เปิดกล่องงาน',
    actionPath: `/club-applications/${notice.id}`,
  });
}

const thaiMonth = (date: string) =>
  new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

// ชมรมส่งรายงานประจำเดือน → ที่ปรึกษาของชมรม
export async function notifyMonthlyReportSubmitted(db: Queryable, reportId: string): Promise<void> {
  const report = await getMonthlyReportNotice(reportId, db);
  if (!report) return;
  const advisors = await listCurrentAdvisorUsers(report.clubId, db);
  await enqueue(db, NOTIFICATION_EVENTS.MONTHLY_REPORT_SUBMITTED, reportId, advisors, {
    subject: `${report.clubName} ส่งรายงานประจำเดือน${thaiMonth(report.reportMonth)}`,
    paragraphs: [
      `${report.clubName} ส่งรายงานผลการดำเนินงานประจำเดือน${thaiMonth(report.reportMonth)} ให้คุณในฐานะที่ปรึกษาชมรม`,
      'กรุณาเข้าระบบเพื่ออ่านรายงานและกดรับทราบ (ใส่ความเห็นได้)',
    ],
    actionLabel: 'อ่านรายงาน',
    actionPath: `/monthly-reports/${report.id}`,
  });
}

// ---------- สมาชิกภาพชมรม ----------

const MEMBER_APPROVE = 'club_member:approve';
const clubPath = (clubId: string) => `/clubs/${clubId}`;

// ผู้สมัครใหม่ → กรรมการที่อนุมัติสมาชิกได้
export async function notifyMembershipApplied(db: Queryable, membershipId: string, eventKey: string): Promise<void> {
  const notice = await getMembershipNotice(membershipId, db);
  if (!notice) return;
  const approvers = await listClubPermissionHolders(notice.clubId, MEMBER_APPROVE, notice.member.userId, db);
  await enqueue(db, NOTIFICATION_EVENTS.MEMBERSHIP_APPLIED, eventKey, approvers, {
    subject: `มีผู้สมัครเป็นสมาชิก${notice.clubName}`,
    paragraphs: [`${notice.member.name ?? 'บุคลากร'} สมัครเป็นสมาชิก${notice.clubName}`, 'กรุณาพิจารณาอนุมัติหรือไม่อนุมัติ (ไม่อนุมัติต้องระบุเหตุผล)'],
    actionLabel: 'พิจารณาใบสมัคร',
    actionPath: clubPath(notice.clubId),
  });
}

// ผลใบสมัคร → ผู้สมัคร
export async function notifyMembershipDecided(
  db: Queryable,
  membershipId: string,
  decision: 'approved' | 'rejected',
  note: string | null,
  eventKey: string,
): Promise<void> {
  const notice = await getMembershipNotice(membershipId, db);
  if (!notice || !notice.memberActive) return;
  const approved = decision === 'approved';
  await enqueue(db, NOTIFICATION_EVENTS.MEMBERSHIP_DECIDED, eventKey, [notice.member], {
    subject: approved ? `คุณเป็นสมาชิก${notice.clubName}แล้ว` : `ใบสมัครสมาชิก${notice.clubName}ไม่ได้รับอนุมัติ`,
    paragraphs: approved
      ? [`คณะกรรมการ${notice.clubName}อนุมัติใบสมัครของคุณแล้ว`]
      : [`ใบสมัครสมาชิก${notice.clubName}ของคุณไม่ได้รับอนุมัติ`, ...(note ? [`เหตุผล: ${note}`] : [])],
    actionLabel: 'เปิดหน้าชมรม',
    actionPath: clubPath(notice.clubId),
  });
}

// คำเชิญเข้าชมรม → ผู้ถูกเชิญ
export async function notifyMembershipInvited(db: Queryable, membershipId: string, inviterName: string, eventKey: string): Promise<void> {
  const notice = await getMembershipNotice(membershipId, db);
  if (!notice || !notice.memberActive) return;
  await enqueue(db, NOTIFICATION_EVENTS.MEMBERSHIP_INVITED, eventKey, [notice.member], {
    subject: `คำเชิญเข้าร่วม${notice.clubName}`,
    paragraphs: [`${inviterName} เชิญคุณเป็นสมาชิก${notice.clubName}`, 'กรุณาเข้าสู่ระบบเพื่อตอบรับหรือปฏิเสธคำเชิญ (ตอบรับแล้วเป็นสมาชิกทันที)'],
    actionLabel: 'ดูคำเชิญ',
    actionPath: clubPath(notice.clubId),
  });
}

// สมาชิกยื่นลาออก → กรรมการที่อนุมัติสมาชิกได้
export async function notifyResignationRequested(db: Queryable, membershipId: string, note: string, eventKey: string): Promise<void> {
  const notice = await getMembershipNotice(membershipId, db);
  if (!notice) return;
  const approvers = await listClubPermissionHolders(notice.clubId, MEMBER_APPROVE, notice.member.userId, db);
  await enqueue(db, NOTIFICATION_EVENTS.RESIGNATION_REQUESTED, eventKey, approvers, {
    subject: `สมาชิกยื่นลาออกจาก${notice.clubName}`,
    paragraphs: [
      `${notice.member.name ?? 'สมาชิก'} ยื่นลาออกจาก${notice.clubName}`,
      `เหตุผล: ${note}`,
      'กรุณารับทราบการลาออก หากไม่ดำเนินการ การลาออกจะมีผลอัตโนมัติเมื่อครบ 30 วัน',
    ],
    actionLabel: 'เปิดหน้าชมรม',
    actionPath: clubPath(notice.clubId),
  });
}
