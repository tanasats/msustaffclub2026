import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  countExistingOrgUnits,
  findClubName,
  insertBroadcastMessage,
  listBroadcastMessages,
  listClubMemberAudience,
  listStaffAudience,
  type StaffAudience,
} from '../repositories/broadcast-messages-repository.js';
import type { Recipient } from '../repositories/notification-recipients-repository.js';
import { listActiveOrgUnits } from '../repositories/org-units-repository.js';
import type { AuthContext } from './authorization.js';
import { notifyClubMessage, notifyStaffAnnouncement } from './notification-service.js';

// เพดานผู้รับต่อครั้ง (กันส่งผิดกลุ่มจำนวนมหาศาล และคิวอีเมล) — มากกว่าบุคลากรทั้งมหาวิทยาลัย
export const MAX_RECIPIENTS = 20000;
const HISTORY_PAGE_SIZE = 20;

export interface StaffAnnouncementInput {
  audience: StaffAudience;
  orgUnitIds: string[];
  title: string;
  body: string;
}

async function resolveStaffAudience(auth: AuthContext, input: Pick<StaffAnnouncementInput, 'audience' | 'orgUnitIds'>): Promise<Recipient[]> {
  const orgUnitIds = input.audience === 'org_units' ? [...new Set(input.orgUnitIds)] : [];
  if (input.audience === 'org_units') {
    if (orgUnitIds.length === 0) throw new AppError(422, 'ORG_UNITS_REQUIRED', 'กรุณาเลือกหน่วยงานอย่างน้อย 1 หน่วยงาน');
    if ((await countExistingOrgUnits(orgUnitIds)) !== orgUnitIds.length) {
      throw new AppError(422, 'ORG_UNIT_NOT_FOUND', 'ไม่พบหน่วยงานที่เลือกบางรายการ');
    }
  }
  const recipients = await listStaffAudience(input.audience, orgUnitIds, auth.user.id, MAX_RECIPIENTS + 1);
  if (recipients.length > MAX_RECIPIENTS) {
    throw new AppError(422, 'TOO_MANY_RECIPIENTS', `ผู้รับเกิน ${MAX_RECIPIENTS.toLocaleString('th-TH')} คน`);
  }
  return recipients;
}

// route ตรวจ permission staff_announcement:send แล้ว (ผูกกับเจ้าหน้าที่สโมสร/นายกสโมสร) — จำนวนผู้รับก่อนส่ง
export async function countStaffAnnouncementRecipients(auth: AuthContext, input: Pick<StaffAnnouncementInput, 'audience' | 'orgUnitIds'>) {
  return { count: (await resolveStaffAudience(auth, input)).length };
}

/**
 * ส่งประกาศจากสโมสร: บันทึกประวัติ + การแจ้งเตือนในระบบให้ทุกคน + อีเมลตามค่าตั้งของผู้รับ ใน transaction เดียว
 * ไม่มีผู้รับ → 422 (ไม่บันทึก)
 */
export async function sendStaffAnnouncement(auth: AuthContext, input: StaffAnnouncementInput) {
  const recipients = await resolveStaffAudience(auth, input);
  if (recipients.length === 0) throw new AppError(422, 'NO_RECIPIENTS', 'ไม่มีผู้รับในกลุ่มที่เลือก');
  return withTransaction(async (client) => {
    const id = await insertBroadcastMessage(
      {
        kind: 'staff_announcement',
        senderUserId: auth.user.id,
        clubId: null,
        audience: input.audience,
        orgUnitIds: input.audience === 'org_units' ? [...new Set(input.orgUnitIds)] : null,
        title: input.title,
        body: input.body,
        recipientCount: recipients.length,
      },
      client,
    );
    await notifyStaffAnnouncement(client, id, recipients, { title: input.title, body: input.body, senderName: auth.user.name });
    return { id, recipientCount: recipients.length };
  });
}

// ตัวเลือกหน่วยงานสำหรับกลุ่มผู้รับ "ตามหน่วยงาน"
export async function getAnnouncementOrgUnits() {
  return { items: await listActiveOrgUnits() };
}

export async function listStaffAnnouncements(page: number) {
  return listBroadcastMessages('staff_announcement', null, HISTORY_PAGE_SIZE, (page - 1) * HISTORY_PAGE_SIZE);
}

// ---------- ข้อความชมรมถึงสมาชิก: route ตรวจสิทธิ์ชมรม club_message:send แล้ว (ชมรมที่ไม่ active ไม่มีสิทธิ์นี้) ----------

export async function countClubMessageRecipients(auth: AuthContext, clubId: string) {
  return { count: (await listClubMemberAudience(clubId, auth.user.id, MAX_RECIPIENTS)).length };
}

export async function sendClubMessage(auth: AuthContext, clubId: string, input: { title: string; body: string }) {
  const clubName = await findClubName(clubId);
  if (!clubName) throw new AppError(404, 'CLUB_NOT_FOUND', 'ไม่พบชมรม');
  const recipients = await listClubMemberAudience(clubId, auth.user.id, MAX_RECIPIENTS);
  if (recipients.length === 0) throw new AppError(422, 'NO_RECIPIENTS', 'ชมรมยังไม่มีสมาชิกคนอื่นที่จะรับข้อความ');
  return withTransaction(async (client) => {
    const id = await insertBroadcastMessage(
      {
        kind: 'club_message',
        senderUserId: auth.user.id,
        clubId,
        audience: 'club',
        orgUnitIds: null,
        title: input.title,
        body: input.body,
        recipientCount: recipients.length,
      },
      client,
    );
    await notifyClubMessage(client, id, recipients, { clubId, clubName, title: input.title, body: input.body, senderName: auth.user.name });
    return { id, recipientCount: recipients.length };
  });
}

export async function listClubMessages(clubId: string, page: number) {
  return listBroadcastMessages('club_message', clubId, HISTORY_PAGE_SIZE, (page - 1) * HISTORY_PAGE_SIZE);
}
