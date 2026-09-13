import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { sendWhatsAppMessage, sendSmsMessage } from './whatsapp.service';
import { t } from './i18n.service';

interface OtpEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  verified: boolean;
  userId?: string;
}

// In-memory store: key = phone/email
const store = new Map<string, OtpEntry>();

export function generateOtp(key: string, userId?: string): string {
  const existing = store.get(key);
  if (existing) {
    const cooldownMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
    const elapsedMs = Date.now() - existing.lastSentAt;
    if (elapsedMs < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      throw new AppError(
        429,
        `Please wait ${waitSeconds}s before requesting another OTP.`,
        'OTP_RESEND_TOO_SOON',
      );
    }
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000;
  store.set(key, { otp, expiresAt, attempts: 0, lastSentAt: Date.now(), verified: false, userId });
  return otp;
}

/** Alias used by auth flow for phone-based OTP with an associated user ID. */
export function sendOtp(phone: string, userId?: string): string {
  return generateOtp(phone, userId);
}

/**
 * Delivers the OTP to the recipient via WhatsApp (Twilio), falling back to a
 * plain SMS (also Twilio) if the WhatsApp send fails and an SMS sender is
 * configured. Logs to the console instead when no Twilio credentials are
 * configured at all (local dev). This is the single swap point for the
 * delivery channel.
 */
export async function deliverOtp(mobile: string, otp: string): Promise<void> {
  const hasWhatsApp = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
  const hasSms = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SMS_FROM);

  if (!hasWhatsApp && !hasSms) {
    if (env.NODE_ENV === 'development') {
      console.log(`[OTP] ${mobile} → ${otp}`);
      return;
    }
    throw new AppError(
      500,
      'OTP delivery is not configured for this environment.',
      'OTP_DELIVERY_NOT_CONFIGURED',
    );
  }

  const smsBody = t('otp.text', { otp, minutes: env.OTP_EXPIRES_MINUTES });

  if (hasWhatsApp) {
    try {
      await sendWhatsAppMessage(mobile, t('otp.whatsapp', { otp, minutes: env.OTP_EXPIRES_MINUTES }));
      return;
    } catch (err) {
      console.warn('[OTP] WhatsApp delivery failed, falling back to SMS if configured.');
      if (!hasSms) {
        throw new AppError(
          503,
          'Failed to send verification code via WhatsApp. Please try again shortly.',
          'OTP_DELIVERY_FAILED',
        );
      }
    }
  }

  try {
    await sendSmsMessage(mobile, smsBody);
  } catch (err) {
    throw new AppError(
      503,
      'Failed to send verification code via WhatsApp or SMS. Please try again shortly.',
      'OTP_DELIVERY_FAILED',
    );
  }
}

/**
 * Generates and delivers an OTP in one step. If delivery fails, the
 * just-created entry is invalidated so the resend cooldown doesn't punish
 * the caller for an OTP they never received.
 */
export async function requestOtpDelivery(phone: string, userId?: string): Promise<string> {
  const otp = sendOtp(phone, userId);
  try {
    await deliverOtp(phone, otp);
  } catch (err) {
    invalidateOtps(phone);
    throw err;
  }
  return otp;
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

  entry.verified = true;
  return { success: true, message: 'OTP verified successfully' };
}

/** True only if `key` has a verified, not-yet-expired OTP session. */
export function isOtpVerified(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  return entry.verified;
}

export function clearOtp(key: string): void {
  store.delete(key);
}

export function invalidateOtps(key: string): void {
  store.delete(key);
}
