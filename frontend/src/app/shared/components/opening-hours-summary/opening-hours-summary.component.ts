import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

import type { Business, OpeningDayKey } from '../../../core/models';
import { DAY_LABEL_KEYS, openingHoursSummary } from '../../utils/opening-hours';

/**
 * One-line opening-hours summary for a business card.
 *
 * A card has room for a single line, so this collapses the structured hours
 * to whichever of these actually applies:
 *
 *   "Open 24 hours"        — every selected day is a full day
 *   "9:00 AM – 5:00 PM"    — every selected day shares one range
 *   "Varies by day"        — per-day hours that genuinely differ
 *
 * The full per-day breakdown goes in the `title` tooltip, so hours that vary
 * are still reachable without leaving the list. Businesses whose hours were
 * never migrated off the legacy free-text column fall back to that string.
 */
@Component({
  selector: 'app-opening-hours-summary',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (summary(); as s) {
      <span class="ohs" [attr.title]="s.detail || null">
        <i class="bi bi-clock-fill" aria-hidden="true"></i>{{ s.label }}
      </span>
    }
  `,
  styles: [`
    .ohs { display: inline-flex; align-items: center; gap: 5px; }
  `],
})
export class OpeningHoursSummaryComponent {

  readonly business = input.required<Business>();

  private translate = inject(TranslateService);

  protected summary = computed(() => {
    const b = this.business();
    const s = openingHoursSummary(
      b.openingHoursJson,
      b.openingHours,
      (k: OpeningDayKey) => this.translate.instant(DAY_LABEL_KEYS[k]),
    );
    if (!s) return null;
    return { ...s, label: s.key ? this.translate.instant(s.key) : s.text };
  });
}
