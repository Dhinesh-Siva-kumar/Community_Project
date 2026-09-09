import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import type { OpeningDayKey, OpeningHoursJson } from '../../../core/models';
import {
  DAY_KEYS,
  DAY_LABEL_KEYS,
  DAY_SHORT_KEYS,
  formatDayRange,
  isOpenNow,
  parseLegacyDays,
  shortDayRange,
} from '../../utils/opening-hours';

interface DayRow {
  key: OpeningDayKey;
  labelKey: string;
  open: boolean;
  /** "9:00 AM – 5:00 PM", or empty when the business is closed that day. */
  range: string;
  /** "9-1" / "24h", for the compact mini grid — empty when closed. */
  shortRange: string;
  is24h: boolean;
}

/**
 * Read-only opening days & hours.
 *
 * Prefers the structured `hoursJson` and renders a full per-day table from
 * it. Businesses created before structured hours existed — or whose free
 * text the backfill couldn't parse — fall back to the original presentation
 * (a Mon–Sun pill strip plus the raw legacy string), so nothing regresses
 * for un-migrated rows.
 */
@Component({
  selector: 'app-opening-hours-display',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './opening-hours-display.component.html',
  styleUrls: ['./opening-hours-display.component.scss'],
})
export class OpeningHoursDisplayComponent {

  readonly hoursJson = input<OpeningHoursJson | null | undefined>(null);
  readonly legacyDays = input<string | null | undefined>(null);
  readonly legacyHours = input<string | null | undefined>(null);
  /** `section` adds the standalone heading; `card` is the compact sidebar form. */
  readonly variant = input<'card' | 'section'>('card');

  protected readonly DAY_KEYS = DAY_KEYS;
  protected readonly DAY_SHORT_KEYS = DAY_SHORT_KEYS;
  protected readonly DAY_LABEL_KEYS = DAY_LABEL_KEYS;

  protected hasStructured = computed(() => {
    const j = this.hoursJson();
    return !!j?.days && DAY_KEYS.some((k) => j.days[k]);
  });

  /** All seven days, so closed days are shown as closed rather than omitted. */
  protected rows = computed<DayRow[]>(() => {
    const j = this.hoursJson();
    return DAY_KEYS.map((key) => {
      const d = j?.days?.[key];
      return {
        key,
        labelKey: DAY_LABEL_KEYS[key],
        open: !!d,
        range: d ? formatDayRange(d) : '',
        shortRange: d ? shortDayRange(d) : '',
        is24h: !!d?.is24h,
      };
    });
  });

  /** Legacy fallback: which day pills to light up. */
  protected legacyActiveDays = computed(() => parseLegacyDays(this.legacyDays()));

  protected isOpenNow = computed(() => isOpenNow(this.hoursJson()));

  protected isActiveDay(day: OpeningDayKey): boolean {
    return this.hasStructured()
      ? !!this.hoursJson()?.days?.[day]
      : this.legacyActiveDays().includes(day);
  }

  protected hasAnything = computed(() =>
    this.hasStructured() || !!this.legacyDays() || !!this.legacyHours(),
  );
}
