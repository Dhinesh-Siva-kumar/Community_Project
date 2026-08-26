import { formatDate } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { LanguageService } from './language.service';

/**
 * Translated "5m ago" / "yesterday" formatting.
 *
 * Four pages had grown their own copy of this, each returning hardcoded
 * English. They all delegate here now, so the wording lives in one place and
 * follows the language toggle — including the absolute date used once an
 * entry is older than the relative window.
 */
@Injectable({ providedIn: 'root' })
export class RelativeTimeService {
  private translate = inject(TranslateService);
  private language = inject(LanguageService);

  /** Long form: "Just now", "5m ago", "yesterday", "3d ago", then a date. */
  format(value: string | Date | null | undefined): string {
    const then = this.toTime(value);
    if (then === null) return '';

    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return this.t('time.justNow');
    if (minutes < 60) return this.t('time.minutesAgo', { count: minutes });
    if (hours < 24) return this.t('time.hoursAgo', { count: hours });
    if (days === 1) return this.t('time.yesterday');
    if (days < 7) return this.t('time.daysAgo', { count: days });

    return formatDate(then, 'mediumDate', this.language.currentLang());
  }

  /** Compact form for dense lists: "now", "5m", "3h", "2w", then a date. */
  short(value: string | Date | null | undefined): string {
    const then = this.toTime(value);
    if (then === null) return '';

    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return this.t('time.shortNow');

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return this.t('time.shortMinutes', { count: minutes });

    const hours = Math.round(minutes / 60);
    if (hours < 24) return this.t('time.shortHours', { count: hours });

    const days = Math.round(hours / 24);
    if (days < 7) return this.t('time.shortDays', { count: days });

    const weeks = Math.round(days / 7);
    if (weeks < 5) return this.t('time.shortWeeks', { count: weeks });

    return formatDate(then, 'mediumDate', this.language.currentLang());
  }

  private toTime(value: string | Date | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params) as string;
  }
}
