import { Injectable } from '@nestjs/common';

interface OtpEntry {
  otp: string;
  expires: number;
  userId?: string;
}

@Injectable()
export class OtpService {
  // In-memory OTP store: key = phone number
  private readonly otpStore = new Map<string, OtpEntry>();

  sendOtp(phone: string, userId?: string): void {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

    this.otpStore.set(phone, { otp, expires, userId });

    // TODO: Integrate an SMS provider (e.g. Twilio, MSG91) to send the OTP
    // For now, log to console for development
    console.log(`[OTP] Phone: ${phone} | OTP: ${otp}`);
  }

  verifyOtp(phone: string, otp: string): { success: boolean; message: string } {
    const entry = this.otpStore.get(phone);

    if (!entry) {
      return { success: false, message: 'OTP not found' };
    }

    if (Date.now() > entry.expires) {
      this.otpStore.delete(phone);
      return { success: false, message: 'OTP expired' };
    }

    if (entry.otp !== otp) {
      return { success: false, message: 'Invalid OTP' };
    }

    return { success: true, message: 'OTP verified' };
  }

  getUserIdByPhone(phone: string): string | undefined {
    return this.otpStore.get(phone)?.userId;
  }

  clearOtp(phone: string): void {
    this.otpStore.delete(phone);
  }
}
