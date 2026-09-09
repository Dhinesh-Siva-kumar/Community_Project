import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Calendar-style date badge for event listing cards and the Event Details
 * page — replaces the old plain "day / month" tile (`.ev-card__date`, which
 * was byte-for-byte duplicated between the admin and user Events pages) with
 * one shared, richer badge that also surfaces the weekday and time, so the
 * event's date is legible without opening the card.
 */
@Component({
  selector: 'app-event-date-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="edb" [class.edb--md]="size() === 'md'">
      <span class="edb__weekday">{{ weekday() }}</span>
      <span class="edb__day">{{ day() }}</span>
      <span class="edb__month">{{ month() }}</span>
      @if (timeLabel()) {
        <span class="edb__time">{{ timeLabel() }}</span>
      }
    </div>
  `,
  styleUrls: ['./event-date-badge.component.scss'],
})
export class EventDateBadgeComponent {
  /** Event date — any value `Date` can parse (the API's ISO timestamp works as-is). */
  readonly date = input.required<string>();
  /** Optional 24h `HH:mm` start time. */
  readonly time = input<string | null | undefined>(null);
  /** `sm` (default) for the card-corner badge; `md` for the Event Details hero. */
  readonly size = input<'sm' | 'md'>('sm');

  private parsed = computed(() => {
    const d = new Date(this.date());
    return isNaN(d.getTime()) ? null : d;
  });

  protected weekday = computed(() => this.parsed()?.toLocaleDateString(undefined, { weekday: 'short' }) ?? '');
  protected day     = computed(() => this.parsed()?.getDate() ?? '');
  protected month   = computed(() => this.parsed()?.toLocaleDateString(undefined, { month: 'short' }) ?? '');

  protected timeLabel = computed(() => {
    const t = this.time();
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  });
}
