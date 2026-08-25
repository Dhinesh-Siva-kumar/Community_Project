import { AsyncLocalStorage } from 'async_hooks';

export type Lang = 'en' | 'ta';

export const SUPPORTED_LANGS: readonly Lang[] = ['en', 'ta'] as const;
export const FALLBACK_LANG: Lang = 'en';

/** Picks a supported language out of an `Accept-Language` header. */
export function parseAcceptLanguage(header: string | undefined): Lang {
  if (!header) return FALLBACK_LANG;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    const base = tag.split('-')[0] as Lang;
    if (SUPPORTED_LANGS.includes(base)) return base;
  }
  return FALLBACK_LANG;
}

/**
 * Carries the current request's IP/user-agent down through the call stack
 * without threading them through every controller/service signature, so
 * deep, fire-and-forget writes like audit logging can attribute themselves
 * to a request without every caller having to pass `req` along.
 */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  /**
   * Language the caller asked for, from `Accept-Language`. Lets outbound text
   * the user reads — OTP emails, WhatsApp messages — match the language they
   * are using the app in, without threading a `lang` argument through every
   * service signature.
   */
  lang: Lang;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(ctx: RequestContext, fn: () => void): void {
  storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Language for the current request, or English outside a request (cron, CLI). */
export function getRequestLang(): Lang {
  return storage.getStore()?.lang ?? FALLBACK_LANG;
}
