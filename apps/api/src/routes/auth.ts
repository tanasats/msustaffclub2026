import { Router, type CookieOptions, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config/index.js';
import { getRequiredAuth, getSessionToken, requireAuth } from '../middlewares/auth.js';
import { createAuthRateLimiter } from '../middlewares/rate-limit.js';
import {
  completeGoogleLogin,
  LoginError,
  logout,
  startGoogleLogin,
  type LoginFailureCode,
  type PendingOAuth,
} from '../services/auth-service.js';
import { getUserProfile } from '../services/profile-service.js';

// cookie อายุสั้นที่จำ state/nonce/PKCE verifier ระหว่างไป Google แล้วกลับมา
const OAUTH_COOKIE_NAME = `${config.session.cookieName}_oauth`;
const OAUTH_COOKIE_PATH = '/auth/google';
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  // Lax: ส่ง cookie เมื่อ Google redirect กลับมาแบบ GET ได้ แต่ไม่ส่งกับ POST จากเว็บอื่น
  sameSite: 'lax',
  secure: config.isProduction,
};

const pendingOAuthSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

function readPendingOAuth(raw: unknown): PendingOAuth | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = pendingOAuthSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // cookie ถูกแก้หรือเสียรูป ให้ถือว่าไม่มี
    return null;
  }
}

function redirectToLoginError(res: Response, code: LoginFailureCode): void {
  const url = new URL('/login', config.webUrl);
  url.searchParams.set('error', code);
  res.redirect(302, url.toString());
}

// สร้าง router ใหม่ต่อ app (rate limiter แต่ละ app นับแยกกัน)
export function createAuthRouter(): Router {
  const authRouter = Router();
  const authRateLimiter = createAuthRateLimiter();

  // public: เริ่ม login → redirect ไปหน้าเลือกบัญชีของ Google
  authRouter.get('/auth/google', authRateLimiter, async (_req, res) => {
    const { authorizationUrl, pending } = await startGoogleLogin();
    res.cookie(OAUTH_COOKIE_NAME, JSON.stringify(pending), {
      ...baseCookieOptions,
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_COOKIE_MAX_AGE_MS,
    });
    res.redirect(302, authorizationUrl);
  });

  // public: Google เรียกกลับมาพร้อม code → ตรวจทุกอย่างแล้วสร้าง session
  authRouter.get('/auth/google/callback', authRateLimiter, async (req, res) => {
    const pending = readPendingOAuth(req.cookies?.[OAUTH_COOKIE_NAME]);
    // ใช้ได้ครั้งเดียว: ลบ cookie ทันทีไม่ว่าผลจะเป็นอย่างไร
    res.clearCookie(OAUTH_COOKIE_NAME, { ...baseCookieOptions, path: OAUTH_COOKIE_PATH });

    const query = callbackQuerySchema.safeParse(req.query);
    if (!pending || !query.success || query.data.error || !query.data.code || !query.data.state) {
      req.log.warn('Google login: callback ไม่สมบูรณ์หรือผู้ใช้ยกเลิก');
      redirectToLoginError(res, 'login_failed');
      return;
    }

    try {
      const session = await completeGoogleLogin({ code: query.data.code, state: query.data.state, pending });
      res.cookie(config.session.cookieName, session.token, {
        ...baseCookieOptions,
        path: '/',
        expires: session.expiresAt,
      });
      req.log.info({ userId: session.userId }, 'Google login สำเร็จ');
      res.redirect(302, config.webUrl);
    } catch (err) {
      if (err instanceof LoginError) {
        req.log.warn({ reason: err.detail }, 'Google login ถูกปฏิเสธ');
        redirectToLoginError(res, err.code);
        return;
      }
      throw err;
    }
  });

  // ต้อง login เท่านั้น: ข้อมูลผู้ใช้ปัจจุบันพร้อม role, permission และข้อมูลนิสิต/บุคลากร
  authRouter.get('/auth/me', requireAuth, async (req, res) => {
    const auth = getRequiredAuth(req);
    const profile = await getUserProfile(auth.user.id, auth.user.email);
    res.json({ user: auth.user, roles: auth.roles, permissions: auth.permissions, profile });
  });

  // public (ไม่บังคับ login): ลบ session ถ้ามี แล้วลบ cookie
  authRouter.post('/auth/logout', authRateLimiter, async (req, res) => {
    const token = getSessionToken(req);
    if (token) {
      await logout(token);
    }
    res.clearCookie(config.session.cookieName, { ...baseCookieOptions, path: '/' });
    res.status(204).end();
  });

  return authRouter;
}
