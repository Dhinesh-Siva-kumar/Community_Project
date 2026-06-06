import { Router, Request, Response, NextFunction } from 'express';
import * as otpService from '../../services/otp.service';
import { checkPhoneExists } from '../auth/auth.service';
import { env } from '../../config/env';

const router = Router();

// POST /api/send-otp
router.post('/send-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobile } = req.body as { mobile?: string };
    if (!mobile) {
      res.status(400).json({ success: false, message: 'mobile is required' });
      return;
    }

    // Reject if the number is already tied to an existing account
    const alreadyRegistered = await checkPhoneExists(mobile);
    if (alreadyRegistered) {
      res.status(409).json({
        success: false,
        message: 'This mobile number is already registered with another account.',
      });
      return;
    }

    const otp = otpService.sendOtp(mobile);
    await otpService.deliverOtp(mobile, otp);

    const response: Record<string, unknown> = { success: true, message: 'OTP sent' };
    if (env.NODE_ENV !== 'production') {
      response['devOtp'] = otp;
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// POST /api/verify-otp
router.post('/verify-otp', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobile, otp } = req.body as { mobile?: string; otp?: string };
    if (!mobile || !otp) {
      res.status(400).json({ success: false, message: 'mobile and otp are required' });
      return;
    }
    const result = otpService.verifyOtp(mobile, otp);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
