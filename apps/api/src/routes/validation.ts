import { z } from 'zod';
import { AppError } from '../errors.js';

// ตัวช่วย validate ที่ใช้ร่วมกันใน route

export const uuidParam = z.uuid();

// อ่าน :id จาก path ถ้าไม่ใช่ uuid ถือว่าไม่พบ (ไม่ให้ PostgreSQL error ตอน cast)
export function parseIdParam(value: unknown, notFoundCode: string, message: string): string {
  const parsed = uuidParam.safeParse(value);
  if (!parsed.success) {
    throw new AppError(404, notFoundCode, message);
  }
  return parsed.data;
}

// ข้อความที่ตัดช่องว่างหัวท้าย และแปลงข้อความว่างเป็น null (ใช้กับฟิลด์ที่ไม่บังคับ)
export function optionalText(max: number) {
  return z
    .string()
    .max(max)
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    });
}

export function requiredText(max: number) {
  return z.string().trim().min(1).max(max);
}
