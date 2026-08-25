import { formatDate } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../../core/services/language.service';

/**
 * Drop-in replacement for `| date` that follows the language toggle.
 *
 * `LOCALE_ID` is fixed at bootstrap and cannot react to a runtime language
 * change, so formatting goes through `formatDate` with the active language
 * instead. The pipe is impure (the locale changes without any input changing)
 * but memoises on value + format + locale, so `formatDate` only runs when one
 * of those actually differs.
 */
@Pipe({ name: 'localizedDate', standalone: true, pure: false })
export class LocalizedDatePipe implements PipeTransform {
  private language = inject(LanguageService);

  private cacheKey = '';
  private cached: string | null = null;

  transform(
    value: Date | string | number | null | undefined,
    format = 'mediumDate',
    timezone?: string,
  ): string | null {
    if (value === null || value === undefined || value === '') return null;

    const locale = this.language.currentLang();
    const key = `${String(value)}|${format}|${timezone ?? ''}|${locale}`;
    if (key === this.cacheKey) return this.cached;

    this.cacheKey = key;
    try {
      this.cached = formatDate(value, format, locale, timezone);
    } catch {
      // Unparseable input — match DatePipe's behaviour of rendering nothing
      // rather than breaking the whole view.
      this.cached = null;
    }
    return this.cached;
  }
}
