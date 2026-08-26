import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { t } from './i18n.service';
import { Lang, FALLBACK_LANG } from './request-context';

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
  // Language comes from the request context (Accept-Language), so the code
  // arrives in whatever language the user is currently using the app in.
  const params = { otp, minutes: env.OTP_EXPIRES_MINUTES };
  await sendEmail({
    to,
    subject: t('otp.subject'),
    html: t('otp.html', params),
    text: t('otp.text', params),
  });
}

/**
 * `lang` is an explicit argument rather than being read from the request
 * context: digests are sent from a scheduled job with no request in scope.
 * Until a language preference is stored on the user record, callers have
 * nothing better than the default to pass.
 */
export async function sendDigestEmail(
  to: string,
  displayName: string,
  items: { message: string; createdAt: Date }[],
  lang: Lang = FALLBACK_LANG,
): Promise<void> {
  const notificationsUrl = `${env.FRONTEND_URL}/user/notifications`;
  const rows = items
    .map((i) => `<li style="margin-bottom:6px;">${i.message} <span style="color:#78716C;font-size:12px;">(${new Date(i.createdAt).toLocaleString()})</span></li>`)
    .join('');

  await sendEmail({
    to,
    subject: items.length === 1
      ? t('digest.subjectOne', {}, lang)
      : t('digest.subjectMany', { count: items.length }, lang),
    html: `
      <p>${t('digest.greeting', { name: displayName }, lang)}</p>
      <p>${t('digest.intro', {}, lang)}</p>
      <ul>${rows}</ul>
      <p><a href="${notificationsUrl}">${t('digest.viewAll', {}, lang)}</a></p>
      <p style="color:#78716C;font-size:12px;">${t('digest.footer', {}, lang)}</p>
    `,
    text: `${t('digest.greeting', { name: displayName }, lang)}\n\n${t('digest.intro', {}, lang)}\n${items.map((i) => `- ${i.message}`).join('\n')}\n\n${t('digest.viewAll', {}, lang)}: ${notificationsUrl}`,
  });
}
