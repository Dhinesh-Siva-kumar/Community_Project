import { Router, Request, Response, NextFunction } from 'express';
import * as otpService from '../../services/otp.service';

const router = Router();

// POST /api/send-otp
router.post('/send-otp', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobile } = req.body as { mobile?: string };
    if (!mobile) {
      res.status(400).json({ message: 'mobile is required' });
      return;
    }
    otpService.sendOtp(mobile);
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    next(err);
  }
});

// POST /api/verify-otp
router.post('/verify-otp', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobile, otp } = req.body as { mobile?: string; otp?: string };
    if (!mobile || !otp) {
      res.status(400).json({ message: 'mobile and otp are required' });
      return;
    }
    const result = otpService.verifyOtp(mobile, otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
