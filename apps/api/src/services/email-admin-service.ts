import { config } from '../config/index.js';
import { withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { mailTransport } from '../mail/index.js';
import { composeEmail } from '../mail/templates.js';
import { countEmailsByStatus, listRecentEmails } from '../repositories/email-outbox-repository.js';
import { getSettingMeta } from '../repositories/system-settings-repository.js';
import type { AuthContext } from './authorization.js';
import { ALL_NOTIFICATION_EVENTS, NOTIFICATION_EVENT_INFO } from './notification-events.js';
import { EMAIL_SETTINGS_META_KEY, getEmailSettings, saveEmailSettings, type EmailSettings } from './system-settings-service.js';

// หน้าตั้งค่าอีเมล — route ตรวจ system_setting:manage แล้ว (ใช้ได้เฉพาะ super_admin ตามที่ยืนยัน)

export async function getEmailAdmin() {
  const [settings, counts, recent, meta] = await Promise.all([
    getEmailSettings(),
    countEmailsByStatus(),
    listRecentEmails(50),
    getSettingMeta(EMAIL_SETTINGS_META_KEY),
  ]);
  return {
    transport: config.mail.transport,
    fromAddress: config.mail.fromAddress,
    enabled: settings.enabled,
    events: ALL_NOTIFICATION_EVENTS.map((code) => ({ code, ...NOTIFICATION_EVENT_INFO[code], enabled: settings.events[code] })),
    counts,
    recent,
    updatedAt: meta?.updatedAt ?? null,
    updatedByName: meta?.updatedByName ?? null,
  };
}

export async function updateEmailSettings(auth: AuthContext, settings: EmailSettings): Promise<void> {
  await withTransaction((client) => saveEmailSettings(settings, auth.user.id, client));
}

/**
 * ส่งอีเมลทดสอบถึงผู้กดเองทันที (ไม่ผ่านคิวและไม่ขึ้นกับสวิตช์) เพื่อยืนยันการตั้งค่าก่อนเปิดใช้จริง
 */
export async function sendTestEmail(auth: AuthContext): Promise<{ transport: string; delivered: boolean }> {
  const content = composeEmail({
    subject: 'ทดสอบอีเมลแจ้งเตือนของระบบชมรมบุคลากร',
    recipientName: auth.user.name,
    paragraphs: ['อีเมลนี้ส่งจากปุ่ม "ส่งอีเมลทดสอบ" ในหน้าตั้งค่าอีเมลของระบบ', 'ถ้าคุณได้รับอีเมลนี้ แสดงว่าระบบส่งอีเมลแจ้งเตือนได้แล้ว'],
    actionLabel: 'เปิดหน้าตั้งค่าอีเมล',
    actionUrl: new URL('/admin/email', config.webUrl).toString(),
  });
  try {
    await mailTransport.send({ to: auth.user.email, ...content });
  } catch (err) {
    throw new AppError(502, 'MAIL_SEND_FAILED', `ส่งอีเมลไม่สำเร็จ: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}`);
  }
  return { transport: mailTransport.kind, delivered: mailTransport.kind === 'gmail' };
}
