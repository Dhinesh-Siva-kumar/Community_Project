import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  } else {
    // Ethereal fallback for development
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[EmailService] Using Ethereal test account:', testAccount.user);
  }

  return transporter;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: env.EMAIL_FROM ?? 'noreply@community.app',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log('[EmailService] Message sent:', info.messageId);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('[EmailService] Preview URL:', previewUrl);
  } catch (err) {
    console.error('[EmailService] Failed to send email:', err);
    // Don't throw — email failure should never crash a request
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your OTP Code',
    html: `<p>Your one-time password is: <strong>${otp}</strong></p><p>It expires in ${env.OTP_EXPIRES_MINUTES} minutes.</p>`,
    text: `Your OTP is: ${otp}. It expires in ${env.OTP_EXPIRES_MINUTES} minutes.`,
  });
}
