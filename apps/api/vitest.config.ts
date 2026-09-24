import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test ใช้ฐาน app_test เท่านั้น: global-setup รัน migration, setup-env ชี้แอปไปที่ app_test
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    // test ที่แตะฐานข้อมูลจริงรันทีละไฟล์ เพื่อไม่ให้ข้อมูลชนกัน
    fileParallelism: false,
  },
});
