import { afterAll } from 'vitest';
import { loadTestDatabaseUrl } from './helpers/test-env.js';

// รันก่อน test แต่ละไฟล์: บังคับให้แอปใช้ฐาน app_test
process.env.DATABASE_URL = loadTestDatabaseUrl();
process.env.NODE_ENV = 'test';

// ปิด pool เมื่อจบไฟล์ (import ทีหลังเพื่อให้ config อ่าน env ที่ตั้งไว้ข้างบน)
afterAll(async () => {
  const { pool } = await import('../src/db/pool.js');
  await pool.end();
});
