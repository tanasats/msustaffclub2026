import { logger } from '../logger.js';
import {
  claimDueEmails,
  markEmailFailed,
  markEmailSent,
  purgeOldEmails,
  releaseExpiredLeases,
  skipStaleEmails,
} from '../repositories/email-outbox-repository.js';
import { getEmailSettings } from '../services/system-settings-service.js';
import type { MailTransport } from './transport.js';

// นโยบายของคิวอีเมล
export const OUTBOX_POLICY = {
  batchSize: 20,
  // ลองซ้ำหลัง 1, 5, 15, 60 นาที แล้วเลิก (ส่งทั้งหมด 5 ครั้ง)
  retryDelaysSeconds: [60, 300, 900, 3600],
  // สัญญาเช่าแถวที่กำลังส่ง: worker ล่มกลางทาง แถวจะกลับมารอส่งหลังเวลานี้
  leaseMinutes: 10,
  staleAfterHours: 24,
  retentionDays: 90,
} as const;

export interface OutboxRunResult {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  paused: boolean;
}

/**
 * ทำงาน 1 รอบ (worker เรียกทุกช่วงเวลา, test เรียกตรงพร้อม transport ปลอม)
 * 1. คืนแถวที่ค้าง sending จนพ้นสัญญาเช่า (worker ล่มกลางทาง) 2. ยกเลิกแถวที่รอนานเกิน 3. ลบประวัติเก่า
 * 4. สวิตช์หลักปิด = หยุดส่ง (แถวยังรอ และจะถูกยกเลิกเมื่อเกินกำหนด) 5. จองแล้วส่งทีละฉบับ
 */
export async function processOutboxOnce(transport: MailTransport): Promise<OutboxRunResult> {
  await releaseExpiredLeases();
  const skipped = await skipStaleEmails(OUTBOX_POLICY.staleAfterHours);
  await purgeOldEmails(OUTBOX_POLICY.retentionDays);

  const result: OutboxRunResult = { sent: 0, retried: 0, failed: 0, skipped, paused: false };
  if (!(await getEmailSettings()).enabled) {
    return { ...result, paused: true };
  }

  const emails = await claimDueEmails(OUTBOX_POLICY.batchSize, OUTBOX_POLICY.leaseMinutes);
  for (const email of emails) {
    try {
      await transport.send({ to: email.recipientEmail, subject: email.subject, text: email.bodyText, html: email.bodyHtml });
      await markEmailSent(email.id);
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryIn = OUTBOX_POLICY.retryDelaysSeconds[email.attempts - 1] ?? null;
      await markEmailFailed(email.id, message, retryIn);
      if (retryIn === null) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}

/**
 * เริ่ม worker ใน process ของ API: ทำงานทุก intervalMs ไม่ซ้อนรอบ (รอบก่อนยังไม่จบ = ข้าม)
 * คืนฟังก์ชัน stop ที่รอรอบปัจจุบันจบก่อน (ใช้ตอน graceful shutdown ก่อนปิด pool)
 */
export function startOutboxWorker(transport: MailTransport, intervalMs: number): () => Promise<void> {
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running) return;
    running = processOutboxOnce(transport)
      .then((r) => {
        if (r.sent || r.retried || r.failed || r.skipped) {
          // ไม่ log ผู้รับหรือเนื้อหา (ข้อมูลส่วนบุคคล)
          logger.info({ outbox: r }, 'mail: ประมวลผลคิวอีเมล');
        }
      })
      .catch((err: unknown) => logger.error({ err }, 'mail: worker ผิดพลาด'))
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
