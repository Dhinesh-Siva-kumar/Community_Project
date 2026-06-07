import { Router } from 'express';
import { authLimiter } from '../../middleware/rateLimiter';
import { authenticate } from '../../middleware/authenticate';
import * as authController from './auth.controller';

const router = Router();

// Apply auth rate limiter to all auth routes
router.use(authLimiter);

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/admin/login
router.post('/admin/login', authController.adminLogin);

// POST /api/auth/refresh
router.post('/refresh', authController.refresh);

// POST /api/auth/logout
router.post('/logout', authenticate, authController.logout);

// GET  /api/auth/me
router.get('/me', authenticate, authController.me);

// GET  /api/auth/check-username/:username
router.get('/check-username/:username', authController.checkUsername);

// GET  /api/auth/lookup-user?q=
router.get('/lookup-user', authController.lookupUser);

// POST /api/auth/forgot-password/send-otp
router.post('/forgot-password/send-otp', authController.forgotPasswordSendOtp);

// POST /api/auth/reset-password/verify
router.post('/reset-password/verify', authController.resetPasswordVerify);

// POST /api/auth/google/initiate
router.post('/google/initiate', authController.googleInitiate);

// POST /api/auth/google/complete
router.post('/google/complete', authController.googleComplete);

export default router;
