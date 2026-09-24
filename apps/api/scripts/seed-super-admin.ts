// สร้างผู้ดูแลระบบสูงสุดคนแรกจาก INITIAL_SUPER_ADMIN_EMAIL
// วิธีใช้: ให้เจ้าของ email login ด้วย Google 1 ครั้ง แล้วรัน pnpm --filter api seed:super-admin
import { config } from '../src/config/index.js';
import { pool } from '../src/db/pool.js';
import { AppError } from '../src/errors.js';
import { bootstrapSuperAdmin } from '../src/services/super-admin-bootstrap-service.js';

async function main(): Promise<void> {
  const email = config.initialSuperAdminEmail;
  if (!email) {
    throw new Error('ต้องกำหนด INITIAL_SUPER_ADMIN_EMAIL ใน apps/api/.env');
  }

  const result = await bootstrapSuperAdmin(email);
  if (result.status === 'granted') {
    console.log(`ให้สิทธิ์ super_admin แก่ผู้ใช้ ${result.userId} เรียบร้อย`);
  } else {
    console.log(`ผู้ใช้ ${result.userId} เป็น super_admin อยู่แล้ว ไม่มีการเปลี่ยนแปลง`);
  }
}

main()
  .catch((err: unknown) => {
    if (err instanceof AppError) {
      console.error(`ไม่สำเร็จ [${err.code}]: ${err.message}`);
    } else {
      console.error('ไม่สำเร็จ:', err);
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end());
