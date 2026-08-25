import { formatNumber } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../../core/services/language.service';

/**
 * Drop-in replacement for `| number` that follows the language toggle.
 * See {@link LocalizedDatePipe} for why this is impure and memoised.
 */
@Pipe({ name: 'localizedNumber', standalone: true, pure: false })
export class LocalizedNumberPipe implements PipeTransform {
  private language = inject(LanguageService);

  private cacheKey = '';
  private cached: string | null = null;

  transform(value: number | string | null | undefined, digitsInfo?: string): string | null {
    if (value === null || value === undefined || value === '') return null;

    const numeric = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(numeric)) return null;

    const locale = this.language.currentLang();
    const key = `${numeric}|${digitsInfo ?? ''}|${locale}`;
    if (key === this.cacheKey) return this.cached;

    this.cacheKey = key;
    this.cached = formatNumber(numeric, locale, digitsInfo);
    return this.cached;
  }
}
