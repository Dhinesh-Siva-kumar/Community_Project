import { Router, Request, Response, NextFunction } from 'express';
import * as otpService from '../../services/otp.service';
import { checkPhoneExists } from '../auth/auth.service';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { otpLimiter } from '../../middleware/rateLimiter';
import { SendOtpDto, VerifyOtpDto } from './otp.dto';

const router = Router();

router.use(otpLimiter);

// POST /api/send-otp
router.post('/send-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobile } = SendOtpDto.parse(req.body);

    // Reject if the number is already tied to an existing account
    const alreadyRegistered = await checkPhoneExists(mobile);
    if (alreadyRegistered) {
      throw new AppError(
        409,
        'This mobile number is already registered with another account.',
        'MOBILE_NUMBER_ALREADY_REGISTERED',
      );
    }

    const otp = await otpService.requestOtpDelivery(mobile);

    const response: Record<string, unknown> = { success: true, message: 'OTP sent' };
    if (env.NODE_ENV === 'development' || !otpService.isDeliveryConfigured()) {
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
    const { mobile, otp } = VerifyOtpDto.parse(req.body);
    const result = otpService.verifyOtp(mobile, otp);
    if (!result.success) {
      throw new AppError(400, result.message, 'OTP_VERIFICATION_FAILED');
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
