import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // production image: รวมเฉพาะไฟล์ที่ต้องใช้รัน (node server.js) ไม่ต้องมี node_modules ทั้งก้อน
  output: 'standalone',
  // monorepo: ให้ตามหา dependency ตั้งแต่ root ของ repo (pnpm เก็บแพ็กเกจไว้ที่ root)
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
