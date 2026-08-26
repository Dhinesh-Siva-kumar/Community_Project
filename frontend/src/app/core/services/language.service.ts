import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, switchMap } from 'rxjs';

export type Lang = 'en' | 'ta';

export const SUPPORTED_LANGS: readonly Lang[] = ['en', 'ta'] as const;

/** Catalog used to fill any key the active language is missing. */
export const FALLBACK_LANG: Lang = 'en';

const STORAGE_KEY = 'app-lang';

/**
 * Key written by the old per-component toggles (landing + auth pages). Still
 * read so users who already chose Tamil keep it, and still written so anything
 * not yet migrated stays in sync.
 */
const LEGACY_STORAGE_KEY = 'landing-lang';

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'ta';
}

/** Reads the persisted choice without needing the injector. */
export function readStoredLang(): Lang {
  if (typeof localStorage === 'undefined') return FALLBACK_LANG;
  const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  return isLang(stored) ? stored : FALLBACK_LANG;
}

/**
 * Single owner of language state for the whole app.
 *
 * Replaces the `currentLang` / `toggleLanguage()` / `loadLanguage()` trio that
 * used to be copy-pasted into the landing and auth components, so the choice
 * now applies everywhere instead of per page.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private translate = inject(TranslateService);
  private platformId = inject(PLATFORM_ID);

  private readonly lang = signal<Lang>(readStoredLang());

  readonly currentLang = this.lang.asReadonly();
  readonly isTamil = computed(() => this.lang() === 'ta');

  /**
   * Runs once from the app initializer. Loads the fallback catalog before the
   * active one so `translate.instant()` is safe to call from TypeScript from
   * the first render onwards.
   */
  init(): Observable<unknown> {
    const lang = this.lang();
    this.applyDocumentLang(lang);
    return this.translate
      .setFallbackLang(FALLBACK_LANG)
      .pipe(switchMap(() => this.translate.use(lang)));
  }

  setLanguage(lang: Lang): void {
    if (lang === this.lang()) return;

    this.lang.set(lang);
    this.translate.use(lang);
    this.applyDocumentLang(lang);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, lang);
      localStorage.setItem(LEGACY_STORAGE_KEY, lang);
    }
  }

  toggle(): void {
    this.setLanguage(this.lang() === 'en' ? 'ta' : 'en');
  }

  /** Drives `html[lang="ta"]` styling and tells the browser how to render the text. */
  private applyDocumentLang(lang: Lang): void {
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.lang = lang;
    }
  }
}
