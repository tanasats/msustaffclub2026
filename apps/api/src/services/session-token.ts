import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// token 32 bytes เข้ารหัส base64url = 43 ตัวอักษร
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

// ในฐานข้อมูลเก็บเฉพาะ SHA-256 ของ token ไม่เก็บ token ดิบ
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

// เทียบข้อความแบบใช้เวลาคงที่ (กันการเดาทีละตัวอักษรจากเวลาตอบสนอง)
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
