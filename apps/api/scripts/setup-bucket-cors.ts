// ตั้ง CORS ของ bucket (S3_BUCKET) ให้หน้าเว็บ (WEB_URL) อัปโหลดไฟล์ตรงจาก browser ได้ — รันซ้ำได้
// วิธีใช้: pnpm --filter api storage:cors
import { config } from '../src/config/index.js';
import { storage } from '../src/storage/s3-storage.js';

try {
  await storage.configureCors([config.webOrigin]);
  console.log(`ตั้ง CORS ของ bucket '${storage.bucket}' ให้ ${config.webOrigin} แล้ว`);
} catch (err) {
  console.error('ตั้ง CORS ไม่สำเร็จ:', err);
  process.exitCode = 1;
}
