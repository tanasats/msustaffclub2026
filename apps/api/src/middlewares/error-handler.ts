import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

interface ErrorBody {
  error: { code: string; message: string };
}

function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

// error จาก body-parser (JSON ผิดรูปแบบ, ขนาดเกิน) มี status และ expose = true
interface HttpLikeError {
  status: number;
  expose: boolean;
  type?: string;
}

function isHttpLikeError(err: unknown): err is HttpLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { status?: unknown }).status === 'number' &&
    (err as { expose?: unknown }).expose === true
  );
}

// เส้นทางที่ไม่มีอยู่
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'ไม่พบหน้าที่ร้องขอ'));
};

// error ทุกตัวมาจบที่นี่ ห้ามส่ง stack trace หรือรายละเอียด SQL ออกไป
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }

  if (err instanceof ZodError) {
    // บอกเฉพาะชื่อฟิลด์ที่ผิด (ไม่ส่งค่าที่ผู้ใช้กรอกกลับไป) เพื่อให้ฟอร์มแสดงจุดที่ต้องแก้ได้
    const fields = [...new Set(err.issues.map((issue) => issue.path.join('.') || '(body)'))].slice(0, 10);
    res.status(400).json(errorBody('VALIDATION_ERROR', `ข้อมูลที่ส่งมาไม่ถูกต้อง: ${fields.join(', ')}`));
    return;
  }

  if (isHttpLikeError(err) && err.status >= 400 && err.status < 500) {
    const code = err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
    const message = code === 'PAYLOAD_TOO_LARGE' ? 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป' : 'รูปแบบคำขอไม่ถูกต้อง';
    res.status(err.status).json(errorBody(code, message));
    return;
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json(errorBody('INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ'));
};
