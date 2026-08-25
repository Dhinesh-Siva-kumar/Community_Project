import { Lang, FALLBACK_LANG, getRequestLang } from './request-context';

/**
 * Translations for text the backend sends *outward* — OTP emails, WhatsApp
 * messages, digest emails. Everything the user reads inside the app is
 * translated in Angular against `frontend/public/assets/i18n/*.json`; only
 * these few strings leave the server as finished prose, so only they need a
 * catalog here.
 *
 * Deliberately a plain object rather than a full i18n library: the string
 * count is tiny and adding a dependency for it would not earn its keep.
 */
type Catalog = Record<string, string>;

const MESSAGES: Record<Lang, Catalog> = {
  en: {
    'otp.subject': 'Your OTP Code',
    'otp.html': '<p>Your one-time password is: <strong>{{otp}}</strong></p><p>It expires in {{minutes}} minutes.</p>',
    'otp.text': 'Your OTP is: {{otp}}. It expires in {{minutes}} minutes.',
    'otp.whatsapp': 'Your TamilConnect verification code is {{otp}}. It expires in {{minutes}} minutes.',
    'digest.subjectOne': 'Your notification summary (1 update)',
    'digest.subjectMany': 'Your notification summary ({{count}} updates)',
    'digest.greeting': 'Hi {{name}},',
    'digest.intro': "Here's what happened since your last summary:",
    'digest.viewAll': 'View all notifications',
    'digest.footer': "You're receiving this because you opted in to email digests. You can turn this off in your notification preferences.",
  },
  ta: {
    'otp.subject': 'உங்கள் OTP குறியீடு',
    'otp.html': '<p>உங்கள் ஒருமுறை கடவுச்சொல்: <strong>{{otp}}</strong></p><p>இது {{minutes}} நிமிடங்களில் காலாவதியாகும்.</p>',
    'otp.text': 'உங்கள் OTP: {{otp}}. இது {{minutes}} நிமிடங்களில் காலாவதியாகும்.',
    'otp.whatsapp': 'உங்கள் TamilConnect சரிபார்ப்புக் குறியீடு {{otp}}. இது {{minutes}} நிமிடங்களில் காலாவதியாகும்.',
    'digest.subjectOne': 'உங்கள் அறிவிப்புச் சுருக்கம் (1 புதுப்பிப்பு)',
    'digest.subjectMany': 'உங்கள் அறிவிப்புச் சுருக்கம் ({{count}} புதுப்பிப்புகள்)',
    'digest.greeting': 'வணக்கம் {{name}},',
    'digest.intro': 'உங்கள் கடைசிச் சுருக்கத்திற்குப் பிறகு நடந்தவை:',
    'digest.viewAll': 'அனைத்து அறிவிப்புகளையும் காண்க',
    'digest.footer': 'மின்னஞ்சல் சுருக்கங்களைப் பெற நீங்கள் ஒப்புக்கொண்டதால் இதைப் பெறுகிறீர்கள். உங்கள் அறிவிப்பு விருப்பங்களில் இதை நிறுத்தலாம்.',
  },
};

/**
 * Looks up `key`, interpolating `{{name}}` placeholders from `params`.
 * Falls back to English, then to the key itself, so a missing translation
 * degrades to readable text rather than an empty string.
 */
export function t(
  key: string,
  params: Record<string, string | number> = {},
  lang: Lang = getRequestLang(),
): string {
  const template = MESSAGES[lang]?.[key] ?? MESSAGES[FALLBACK_LANG][key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    name in params ? String(params[name]) : `{{${name}}}`,
  );
}
