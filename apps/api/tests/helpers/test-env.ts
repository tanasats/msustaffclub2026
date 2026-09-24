import { existsSync } from 'node:fs';

/**
 * โหลด apps/api/.env (ถ้ามี) แล้วคืน TEST_DATABASE_URL
 * ปฏิเสธถ้าไม่ได้ชี้ไปฐาน app_test เพื่อกันรัน test ทับข้อมูล app_dev
 */
export function loadTestDatabaseUrl(): string {
  const envFile = new URL('../../.env', import.meta.url);
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('ต้องกำหนด TEST_DATABASE_URL ก่อนรัน test');
  }
  if (new URL(testDatabaseUrl).pathname !== '/app_test') {
    throw new Error('TEST_DATABASE_URL ต้องชี้ไปที่ฐาน app_test เท่านั้น (ห้ามรัน test กับ app_dev)');
  }
  return testDatabaseUrl;
}
