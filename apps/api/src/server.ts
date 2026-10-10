import { createApp } from './app.js';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { startOutboxWorker } from './mail/outbox-worker.js';
import { mailTransport } from './mail/index.js';
import { startPeriodicJob } from './jobs/periodic.js';
import { processDueResignations } from './services/membership-service.js';
import { purgeOldNotifications } from './services/notifications-service.js';

// งานสมาชิกตามรอบ (เช่น คำขอลาออกที่ครบกำหนดมีผลอัตโนมัติ) — ไม่ต้องตรงเวลาเป๊ะ จึงทำชั่วโมงละครั้ง
const MEMBERSHIP_JOB_INTERVAL_MS = 60 * 60 * 1000;

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`API พร้อมใช้งานที่ port ${config.port}`);
});

// ส่งอีเมลจากคิวเฉพาะเมื่อตั้ง MAIL_TRANSPORT=gmail (โหมด log: อีเมลค้างในคิวและถูกยกเลิกเมื่อเกิน 24 ชม.)
let stopOutboxWorker: () => Promise<void> = async () => {};
if (mailTransport.kind === 'gmail') {
  stopOutboxWorker = startOutboxWorker(mailTransport, config.mail.workerIntervalMs);
} else {
  logger.warn('MAIL_TRANSPORT=log — ระบบจะไม่ส่งอีเมลแจ้งเตือนจริง');
}

const stopMembershipJob = startPeriodicJob('membership', processDueResignations, MEMBERSHIP_JOB_INTERVAL_MS);
// ลบการแจ้งเตือนในระบบที่เก่าเกินระยะเก็บ (ชั่วโมงละครั้งพอ)
const stopNotificationJob = startPeriodicJob('notifications', purgeOldNotifications, MEMBERSHIP_JOB_INTERVAL_MS);

server.on('error', (err) => {
  logger.fatal({ err }, 'เริ่ม HTTP server ไม่สำเร็จ');
  process.exit(1);
});

// ปิดระบบอย่างนุ่มนวล: หยุดรับ request ใหม่ → รอ request เดิมจบ → หยุด worker อีเมล → ปิด pool
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`ได้รับ ${signal} กำลังปิดระบบ`);

  // กันค้าง: ถ้าปิดไม่เสร็จใน 10 วินาทีให้บังคับออก
  const forceExit = setTimeout(() => {
    logger.error('ปิดระบบไม่ทันเวลา บังคับออก');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((closeErr) => {
    if (closeErr) logger.error({ err: closeErr }, 'ปิด HTTP server ผิดพลาด');
    // รอ worker ส่งอีเมลรอบปัจจุบันจบก่อนปิด pool
    Promise.all([stopOutboxWorker(), stopMembershipJob(), stopNotificationJob()])
      .then(() => pool.end())
      .then(() => {
        logger.info('ปิดระบบเรียบร้อย');
        process.exit(closeErr ? 1 : 0);
      })
      .catch((poolErr: unknown) => {
        logger.error({ err: poolErr }, 'ปิด database pool ผิดพลาด');
        process.exit(1);
      });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
