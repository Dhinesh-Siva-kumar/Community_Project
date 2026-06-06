import crypto from 'crypto';
import { env } from '../config/env';

interface OtpEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
  userId?: string;
}

// In-memory store: key = phone/email
const store = new Map<string, OtpEntry>();

export function generateOtp(key: string, userId?: string): string {
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000;
  store.set(key, { otp, expiresAt, attempts: 0, userId });
  return otp;
}

/** Alias used by auth flow for phone-based OTP with an associated user ID. */
export function sendOtp(phone: string, userId?: string): string {
  return generateOtp(phone, userId);
}

/**
 * Delivers the OTP to the recipient via SMS (Twilio) or logs it in development.
 * This is the single swap point for the SMS provider.
 */
export async function deliverOtp(mobile: string, otp: string): Promise<void> {
  if (
    env.NODE_ENV === 'production' &&
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_WHATSAPP_FROM
  ) {
    // TODO: swap Twilio client in here
    // const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   body: `Your OTP is ${otp}. Valid for ${env.OTP_EXPIRES_MINUTES} minutes.`,
    //   from: env.TWILIO_WHATSAPP_FROM,
    //   to: mobile,
    // });
  } else {
    console.log(`[OTP] ${mobile} → ${otp}`);
  }
}

export function getUserIdByPhone(phone: string): string | null {
  return store.get(phone)?.userId ?? null;
}

export function verifyOtp(key: string, otp: string): { success: boolean; message: string } {
  const entry = store.get(key);
  if (!entry) return { success: false, message: 'OTP not found or expired' };

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { success: false, message: 'OTP has expired' };
  }

  entry.attempts += 1;
  if (entry.attempts >= env.OTP_MAX_ATTEMPTS) {
    store.delete(key);
    return { success: false, message: 'Too many failed attempts' };
  }

  if (entry.otp !== otp) return { success: false, message: 'Invalid OTP' };

  store.delete(key);
  return { success: true, message: 'OTP verified successfully' };
}

export function clearOtp(key: string): void {
  store.delete(key);
}

export function invalidateOtps(key: string): void {
  store.delete(key);
}

