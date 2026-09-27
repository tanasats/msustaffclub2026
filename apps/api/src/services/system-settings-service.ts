import { pool, type Queryable } from '../db/pool.js';
import { getSettingValues, upsertSetting } from '../repositories/system-settings-repository.js';
import { ALL_NOTIFICATION_EVENTS, type NotificationEvent } from './notification-events.js';

const EMAIL_ENABLED_KEY = 'email.enabled';
const EMAIL_EVENTS_KEY = 'email.events';

export interface EmailSettings {
  // สวิตช์หลัก: ปิด = ไม่สร้างและไม่ส่งอีเมลใด ๆ (ค่าเริ่มต้นปิด ให้ทดสอบก่อนเปิดใช้จริง)
  enabled: boolean;
  events: Record<NotificationEvent, boolean>;
}

/**
 * ค่าตั้งค่าอีเมล (ค่าเริ่มต้น: สวิตช์หลักปิด, ทุกเหตุการณ์เปิด)
 * รับ db เพื่ออ่านใน transaction เดียวกับเหตุการณ์ได้
 */
export async function getEmailSettings(db: Queryable = pool): Promise<EmailSettings> {
  const values = await getSettingValues([EMAIL_ENABLED_KEY, EMAIL_EVENTS_KEY], db);
  const stored = (values.get(EMAIL_EVENTS_KEY) ?? {}) as Partial<Record<string, unknown>>;
  const events = Object.fromEntries(
    ALL_NOTIFICATION_EVENTS.map((code) => [code, typeof stored[code] === 'boolean' ? stored[code] : true]),
  ) as Record<NotificationEvent, boolean>;
  return { enabled: values.get(EMAIL_ENABLED_KEY) === true, events };
}

export async function saveEmailSettings(settings: EmailSettings, updatedBy: string, db: Queryable): Promise<void> {
  await upsertSetting(EMAIL_ENABLED_KEY, settings.enabled, updatedBy, db);
  await upsertSetting(EMAIL_EVENTS_KEY, settings.events, updatedBy, db);
}

export const EMAIL_SETTINGS_META_KEY = EMAIL_ENABLED_KEY;
