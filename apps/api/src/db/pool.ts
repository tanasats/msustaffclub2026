import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

// Pool ตัวเดียวทั้งแอป
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// connection ที่ว่างอยู่ใน pool อาจ error ได้ (เช่น DB restart) ต้อง log ไว้ ไม่เช่นนั้น process จะล่ม
pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL pool error');
});

export type DbClient = pg.PoolClient;

/**
 * รันงานหลายคำสั่งใน transaction เดียว
 * สำเร็จทั้งหมด = COMMIT, มี error = ROLLBACK แล้วโยน error ต่อ และคืน client ให้ pool เสมอ
 */
export async function withTransaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'ROLLBACK ล้มเหลว');
    }
    throw err;
  } finally {
    client.release();
  }
}
