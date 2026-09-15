import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, retry, timeout, timer } from 'rxjs';
import { ApiService } from './api.service';

/** Only Tamil is supported today; extend this when a second language ships. */
export type TranslationTargetLang = 'ta';

interface TranslateFieldsResponse {
  translated: Record<string, string>;
}

/**
 * Bulk-translates a keyed map of source strings via the backend's OpenAI-backed
 * `/translation` endpoint. Cache is in-memory only and per session — cleared
 * on every language switch by `LanguageService`, never persisted.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private api = inject(ApiService);

  private readonly cache = new Map<string, string>();

  translateFields(
    fields: Record<string, string>,
    targetLang: TranslationTargetLang,
  ): Observable<Record<string, string>> {
    const result: Record<string, string> = {};
    const misses: Record<string, string> = {};

    for (const [key, text] of Object.entries(fields)) {
      const cached = this.cache.get(this.cacheKey(targetLang, text));
      if (cached !== undefined) {
        result[key] = cached;
      } else {
        misses[key] = text;
      }
    }

    if (Object.keys(misses).length === 0) {
      return of(result);
    }

    return this.api
      .post<TranslateFieldsResponse>('/translation', { fields: misses, targetLang })
      .pipe(
        timeout(15_000),
        retry({ count: 2, delay: (_error, attempt) => timer(1000 * attempt) }),
        map(({ translated }) => {
          for (const [key, text] of Object.entries(misses)) {
            const value = translated[key] ?? text;
            this.cache.set(this.cacheKey(targetLang, text), value);
            result[key] = value;
          }
          return result;
        }),
        // Silent fallback to the original text — a failed translation should
        // never block content from rendering.
        catchError(() => {
          for (const [key, text] of Object.entries(misses)) {
            result[key] = text;
          }
          return of(result);
        }),
      );
  }

  /** Called by `LanguageService` on every language switch. */
  clearCache(): void {
    this.cache.clear();
  }

  private cacheKey(targetLang: TranslationTargetLang, sourceText: string): string {
    return `${targetLang}::${sourceText}`;
  }
}
