import twilio from 'twilio';
import { env } from '../config/env';

let twilioClient: ReturnType<typeof twilio> | null = null;

function getClient(): ReturnType<typeof twilio> | null {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return null;
  }
  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
): Promise<void> {
  const c = getClient();
  if (!c) {
    console.warn('[WhatsAppService] Twilio credentials not set — skipping WhatsApp message.');
    return;
  }

  const from = env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

  try {
    const msg = await c.messages.create({
      from,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body,
    });
    console.log('[WhatsAppService] Message sent:', msg.sid);
  } catch (err) {
    console.error('[WhatsAppService] Failed to send message:', err);
  }
}
