import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

// Routers
import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import communitiesRouter from './modules/communities/communities.router';
import postsRouter from './modules/posts/posts.router';
import businessRouter from './modules/business/business.router';
import eventsRouter from './modules/events/events.router';
import jobsRouter from './modules/jobs/jobs.router';
import notificationsRouter from './modules/notifications/notifications.router';
import masterDataRouter from './modules/master-data/master-data.router';
import uploadRouter from './modules/upload/upload.router';
import otpRouter from './modules/otp/otp.router';

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

// 7. Serve static uploads
app.use(
  '/uploads',
  express.static(path.resolve(env.UPLOADS_PATH), {
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
app.use('/api/master-data', masterDataRouter);
app.use('/api/upload', uploadRouter);
// OTP standalone endpoints were at /api/send-otp and /api/verify-otp in NestJS
app.use('/api', otpRouter);

// 11. Global error handler — MUST be last
app.use(errorHandler);

export default app;
