import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { imageServeWithCache } from './middleware/cacheHeaders';
import { requestContext } from './middleware/requestContext';
import { UPLOADS_BASE } from './services/upload-storage.service';

// Routers
import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import communitiesRouter from './modules/communities/communities.router';
import postsRouter from './modules/posts/posts.router';
import businessRouter from './modules/business/business.router';
import eventsRouter from './modules/events/events.router';
import jobsRouter from './modules/jobs/jobs.router';
import notificationsRouter from './modules/notifications/notifications.router';
import auditRouter from './modules/audit/audit.router';
import masterDataRouter from './modules/master-data/master-data.router';
import uploadRouter from './modules/upload/upload.router';
import otpRouter from './modules/otp/otp.router';
import shareRouter from './modules/share/share.router';
import reportsRouter from './modules/reports/reports.router';
import analyticsRouter from './modules/analytics/analytics.router';

const app = express();

// 1. Helmet
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// 2. Trust proxy (required for rate limiters behind nginx/load-balancers)
app.set('trust proxy', 1);

// 3. CORS
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// 4. Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 5. Cookie parser
app.use(cookieParser());

// 6. Rate limit all /api routes
app.use('/api', apiLimiter);

// 6b. Bind request IP/user-agent for the lifetime of the request so deep,
//     fire-and-forget writes (e.g. audit logging) can attribute themselves
//     without every service function threading `req` through.
app.use(requestContext);

// 7. Serve static uploads with cache headers
app.use(
  '/uploads',
  imageServeWithCache,
  express.static(UPLOADS_BASE, {
    maxAge: '30d',
    index: false,
    dotfiles: 'deny',
  }),
);

// 8. Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 9. Global request logger
app.use((req, _res, next) => {
  console.log('[REQUEST]', req.method, req.url);
  next();
});

// 10. API routes — preserve exact URL structure from NestJS app
//     NestJS used global prefix /api; controllers added their own segment.
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/communities', communitiesRouter);
app.use('/api/posts', postsRouter);
app.use('/api/business', businessRouter);
app.use('/api/events', eventsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/master-data', masterDataRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/analytics', analyticsRouter);
// OTP standalone endpoints were at /api/send-otp and /api/verify-otp in NestJS
app.use('/api', otpRouter);
app.use('/share', shareRouter);

// 11. Serve the built Angular app on the same origin (production deployment).
//     Skipped automatically if the frontend hasn't been built into
//     FRONTEND_DIST_PATH (e.g. local dev, where `ng serve` runs on its own port).
const frontendDistPath = path.resolve(process.cwd(), env.FRONTEND_DIST_PATH);
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
if (fs.existsSync(frontendIndexPath)) {
  app.use(express.static(frontendDistPath, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || /^\/(api|share|uploads|health)(\/|$)/.test(req.path)) {
      next();
      return;
    }
    res.sendFile(frontendIndexPath);
  });
}

// 12. Global error handler — MUST be last
app.use(errorHandler);

export default app;
