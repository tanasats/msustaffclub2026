import { createApp } from './app.js';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`API พร้อมใช้งานที่ port ${config.port}`);
});

server.on('error', (err) => {
  logger.fatal({ err }, 'เริ่ม HTTP server ไม่สำเร็จ');
  process.exit(1);
});

// ปิดระบบอย่างนุ่มนวล: หยุดรับ request ใหม่ → รอ request เดิมจบ → ปิด pool
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
    pool
      .end()
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
