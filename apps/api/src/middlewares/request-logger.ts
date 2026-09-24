import { pinoHttp } from 'pino-http';
import { logger } from '../logger.js';

export const requestLogger = pinoHttp({
  logger,
  // ไม่ log /health เพื่อไม่ให้ log รก (ถูกเรียกถี่จาก monitoring)
  autoLogging: { ignore: (req) => req.url === '/health' },
});
