import { existsSync } from 'node:fs';

// โหลด apps/api/.env (ถ้ามี) แล้วบังคับให้ใช้ฐาน app_test เท่านั้น
const envFile = new URL('../.env', import.meta.url);
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

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
