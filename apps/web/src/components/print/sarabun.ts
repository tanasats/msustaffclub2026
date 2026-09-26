import { Sarabun } from 'next/font/google';

// ฟอนต์ราชการสำหรับเอกสารพิมพ์ (โหลดผ่าน next/font เหมือนฟอนต์อื่นของระบบ ไม่ต้องเพิ่ม dependency)
export const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '700'],
  variable: '--font-sarabun',
  display: 'swap',
});
