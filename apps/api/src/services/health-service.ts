import { pingDatabase } from '../repositories/health-repository.js';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

export interface HealthStatus {
  status: 'ok';
  database: 'ok';
}

export async function checkHealth(): Promise<HealthStatus> {
  try {
    await pingDatabase();
  } catch (err) {
    logger.error({ err }, 'health check: เชื่อมต่อฐานข้อมูลไม่ได้');
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้');
  }
  return { status: 'ok', database: 'ok' };
}
