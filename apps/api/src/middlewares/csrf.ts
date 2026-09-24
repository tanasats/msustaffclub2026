import type { RequestHandler } from 'express';
import { config } from '../config/index.js';
import { AppError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ป้องกัน CSRF: request ที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) ต้องมี header Origin ตรงกับ WEB_URL
 * browser ใส่ Origin ให้เองและเว็บอื่นปลอมไม่ได้ ถ้าไม่มี Origin ถือว่าไม่ผ่าน
 * (GET จึงห้ามใช้เปลี่ยนข้อมูล)
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (req.get('Origin') !== config.webOrigin) {
    throw new AppError(403, 'INVALID_ORIGIN', 'คำขอนี้ไม่ได้มาจากเว็บไซต์ของระบบ');
  }
  next();
};
