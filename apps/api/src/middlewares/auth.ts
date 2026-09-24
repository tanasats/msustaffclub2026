import type { Request, RequestHandler } from 'express';
import { config } from '../config/index.js';
import { AppError } from '../errors.js';
import { resolveSession } from '../services/auth-service.js';
import { hasPermission, type AuthContext } from '../services/authorization.js';
import type { PermissionCode } from '../services/permissions.js';

// ผูกข้อมูลผู้ใช้กับ request ด้วย WeakMap (ไม่ต้องแก้ type ของ Express และหายไปพร้อม request)
const authByRequest = new WeakMap<Request, AuthContext>();

export function getAuth(req: Request): AuthContext | null {
  return authByRequest.get(req) ?? null;
}

// ใช้ใน route ที่ผ่าน requireAuth แล้ว
export function getRequiredAuth(req: Request): AuthContext {
  const auth = authByRequest.get(req);
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ');
  }
  return auth;
}

export function getSessionToken(req: Request): string | null {
  const value: unknown = req.cookies?.[config.session.cookieName];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * อ่าน session จาก cookie ทุก request (ถ้ามี) แล้วโหลดผู้ใช้และสิทธิ์จากฐานข้อมูลใหม่เสมอ
 * ไม่บังคับ login (ให้ requireAuth / requirePermission เป็นคนตัดสิน)
 */
export const loadSession: RequestHandler = async (req, res, next) => {
  const token = getSessionToken(req);
  if (!token) {
    next();
    return;
  }
  const auth = await resolveSession(token);
  if (auth) {
    authByRequest.set(req, auth);
  } else {
    // cookie ใช้ไม่ได้แล้ว (หมดอายุ/ถูกเพิกถอน/บัญชีถูกปิด) ลบทิ้งให้ browser
    res.clearCookie(config.session.cookieName, { path: '/' });
  }
  next();
};

// ต้อง login เท่านั้น (ไม่ต้องมี permission เฉพาะ)
export const requireAuth: RequestHandler = (req, _res, next) => {
  getRequiredAuth(req);
  next();
};

// ต้อง login และมี permission ที่กำหนด (ตรวจผ่าน hasPermission เท่านั้น)
export function requirePermission(permission: PermissionCode): RequestHandler {
  return (req, _res, next) => {
    const auth = getRequiredAuth(req);
    if (!hasPermission(auth, permission)) {
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดำเนินการนี้');
    }
    next();
  };
}
