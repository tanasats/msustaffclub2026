import { rateLimit } from 'express-rate-limit';
import { config } from '../config/index.js';

// จำกัดจำนวนครั้งที่เรียก endpoint login ต่อ IP (สร้างใหม่ต่อ app เพื่อให้ test แยกกัน)
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: config.authRateLimit.windowMinutes * 60 * 1000,
    limit: config.authRateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message: 'มีการเรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
      });
    },
  });
}
