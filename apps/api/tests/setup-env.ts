import { afterAll } from 'vitest';
import { loadTestDatabaseUrl } from './helpers/test-env.js';

// รันก่อน test แต่ละไฟล์: บังคับให้แอปใช้ฐาน app_test
process.env.DATABASE_URL = loadTestDatabaseUrl();
// ไฟล์ของ test ใช้ bucket แยก (สร้างด้วย docker/garage/setup.sh)
if (!process.env.TEST_S3_BUCKET) {
  throw new Error('ต้องกำหนด TEST_S3_BUCKET ก่อนรัน test');
}
process.env.S3_BUCKET = process.env.TEST_S3_BUCKET;
process.env.NODE_ENV = 'test';

// ปิด pool เมื่อจบไฟล์ (import ทีหลังเพื่อให้ config อ่าน env ที่ตั้งไว้ข้างบน)
afterAll(async () => {
  const { closeTestServers } = await import('./helpers/http.js');
  await closeTestServers();
  const { pool } = await import('../src/db/pool.js');
  await pool.end();
});
