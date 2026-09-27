import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { requestLogger } from './middlewares/request-logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { loadSession } from './middlewares/auth.js';
import { requireTrustedOrigin } from './middlewares/csrf.js';
import { achievementsRouter } from './routes/achievements.js';
import { activitiesRouter } from './routes/activities.js';
import { reportsRouter } from './routes/reports.js';
import { sportsRouter } from './routes/sports.js';
import { competitionsRouter } from './routes/competitions.js';
import { selectionsRouter } from './routes/selections.js';
import { adminRolesRouter } from './routes/admin-roles.js';
import { createAuthRouter } from './routes/auth.js';
import { clubApplicationsRouter } from './routes/club-applications.js';
import { clubMasterRouter } from './routes/club-master.js';
import { clubsRouter } from './routes/clubs.js';
import { usersRouter } from './routes/users.js';
import { filesRouter } from './routes/files.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { publicRouter } from './routes/public.js';

// สร้าง Express app โดยไม่ listen เพื่อให้ test เรียกผ่าน supertest ได้
export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLogger);
  // อนุญาตเฉพาะ origin ของ web เท่านั้น และส่ง cookie ข้าม origin ได้
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requireTrustedOrigin);
  app.use(loadSession);

  app.use(healthRouter);
  app.use(publicRouter);
  app.use(createAuthRouter());
  app.use(clubMasterRouter);
  app.use(usersRouter);
  app.use(clubApplicationsRouter);
  app.use(clubsRouter);
  app.use(achievementsRouter);
  app.use(activitiesRouter);
  app.use(reportsRouter);
  app.use(sportsRouter);
  app.use(competitionsRouter);
  app.use(selectionsRouter);
  app.use(adminRolesRouter);
  app.use(meRouter);
  app.use(filesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
