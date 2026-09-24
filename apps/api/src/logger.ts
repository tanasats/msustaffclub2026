import { pino } from 'pino';
import { config } from './config/index.js';

export const logger = pino({
  level: config.logLevel,
  // ปิดบังข้อมูลอ่อนไหวไม่ให้ลง log
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
});
