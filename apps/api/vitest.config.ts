import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test ใช้ฐาน app_test เท่านั้น (ดู tests/setup-env.ts)
    setupFiles: ['./tests/setup-env.ts'],
    // test ที่แตะฐานข้อมูลจริงรันทีละไฟล์ เพื่อไม่ให้ข้อมูลชนกัน
    fileParallelism: false,
  },
});
