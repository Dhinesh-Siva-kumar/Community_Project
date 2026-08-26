import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Themed replacement for `<input type="date">`.
 *
 * The native control can't be styled past its border — the picker itself is
 * browser chrome — so this renders its own amber-themed calendar popup while
 * keeping the exact same **value format** (`yyyy-MM-dd`) the native input
 * used. That matters: a lot of call sites compare/emit these strings
 * directly (quick-date presets, `toInputDate()` helpers, API query params),
 * so they keep working untouched.
 *
 * Works with `formControlName`, `[(ngModel)]` and `[ngModel]`+`(ngModelChange)`.
 */
@Component({
  selector: 'app-date-input',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputComponent), multi: true },
  ],
  templateUrl: './date-input.component.html',
  styleUrls: ['./date-input.component.scss'],
})
export class DateInputComponent implements ControlValueAccessor {

  // ── Inputs ────────────────────────────────────────────────────
  readonly placeholder = input<string>('Select date');
  /** Earliest selectable date, `yyyy-MM-dd`. Empty = unbounded. */
  readonly min         = input<string>('');
  /** Latest selectable date, `yyyy-MM-dd`. Empty = unbounded. */
  readonly max         = input<string>('');
  readonly ariaLabel   = input<string>('');
  /** Hides the inline clear (×) affordance — for required fields. */
  readonly clearable   = input<boolean>(true);
  /** Paints the error border — mirrors the `.cm-input-error` modifier. */
  readonly invalid     = input<boolean>(false);

  // Explicit type argument on `inject` (rather than `inject(ElementRef<HTMLElement>)`)
  // so `nativeElement` is a real HTMLElement — the instantiation-expression
  // form resolves to an untyped call and loses the element typing.
  private readonly hostEl     = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  // ── State ─────────────────────────────────────────────────────
  /** Committed value in `yyyy-MM-dd`, or '' when empty. */
  protected value      = signal<string>('');
  protected isOpen     = signal(false);
  protected isDisabled = signal(false);
  protected dropUp     = signal(false);

  /** First of the month the grid is currently showing. */
  protected viewDate = signal<Date>(startOfMonth(new Date()));

  protected readonly weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  constructor() {
    // Capture phase so this still fires inside modal shells that
    // stopPropagation() on their own container to guard the backdrop.
    const onDocClick = (e: MouseEvent) => {
      if (this.isOpen() && !this.hostEl.nativeElement.contains(e.target as Node)) {
        this.close();
      }
    };
    document.addEventListener('click', onDocClick, true);
    this.destroyRef.onDestroy(() => document.removeEventListener('click', onDocClick, true));
  }

  // ── Derived ───────────────────────────────────────────────────
  protected displayText = computed(() => {
    const d = parseISO(this.value());
    if (!d) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  protected monthLabel = computed(() =>
    this.viewDate().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  );

  /**
   * The 6×7 grid. Always a fixed 42 cells so the panel never changes
   * height as the user pages between months (which would make the
   * footer jump around).
   */
  protected days = computed<DayCell[]>(() => {
    const view     = this.viewDate();
    const selected = this.value();
    const minD     = parseISO(this.min());
    const maxD     = parseISO(this.max());
    const todayKey = toISO(new Date());

    const first = startOfMonth(view);
    // Monday-first: JS getDay() is Sun=0, so shift into Mon=0.
    const lead  = (first.getDay() + 6) % 7;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - lead);

    return Array.from({ length: 42 }, (_, i) => {
      const d   = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = toISO(d);
      return {
        key,
        day:          d.getDate(),
        otherMonth:   d.getMonth() !== view.getMonth(),
        isToday:      key === todayKey,
        isSelected:   key === selected,
        disabled:     (!!minD && d < minD) || (!!maxD && d > maxD),
      };
    });
  });

  /** Disables the ‹ / › pagers once the whole target month is out of range. */
  protected prevDisabled = computed(() => {
    const minD = parseISO(this.min());
    if (!minD) return false;
    const v = this.viewDate();
    return new Date(v.getFullYear(), v.getMonth(), 0) < minD;
  });

  protected nextDisabled = computed(() => {
    const maxD = parseISO(this.max());
    if (!maxD) return false;
    const v = this.viewDate();
    return new Date(v.getFullYear(), v.getMonth() + 1, 1) > maxD;
  });

  protected todayDisabled = computed(() => {
    const minD = parseISO(this.min());
    const maxD = parseISO(this.max());
    const now  = new Date();
    return (!!minD && now < minD) || (!!maxD && now > maxD);
  });

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: string) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: string | null): void {
    const next = v ?? '';
    this.value.set(next);
    // Re-anchor the grid so reopening lands on the selected month
    // rather than wherever the user last paged to.
    this.viewDate.set(startOfMonth(parseISO(next) ?? new Date()));
  }

  registerOnChange(fn: (v: string) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  // ── Interaction ───────────────────────────────────────────────
  protected toggle(): void {
    if (this.isDisabled()) return;
    if (this.isOpen()) { this.close(); return; }

    this.viewDate.set(startOfMonth(parseISO(this.value()) ?? new Date()));
    // Flip above the trigger when a ~340px panel wouldn't fit below —
    // these inputs often sit low in filter drawers and modals.
    const rect = this.hostEl.nativeElement.getBoundingClientRect();
    this.dropUp.set(window.innerHeight - rect.bottom < 340 && rect.top > 340);
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
    this._onTouched();
  }

  protected select(cell: DayCell): void {
    if (cell.disabled) return;
    this.commit(cell.key);
    this.close();
  }

  protected selectToday(): void {
    if (this.todayDisabled()) return;
    this.commit(toISO(new Date()));
    this.close();
  }

  protected clear(e: Event): void {
    e.stopPropagation();
    this.commit('');
    this.close();
  }

  protected shiftMonth(delta: number): void {
    const v = this.viewDate();
    this.viewDate.set(new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  private commit(v: string): void {
    this.value.set(v);
    this._onChange(v);
    this._onTouched();
  }
}

interface DayCell {
  key: string;
  day: number;
  otherMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  disabled: boolean;
}

// ── Date helpers ────────────────────────────────────────────────
// Deliberately local-time only: `new Date('2026-01-31')` parses as UTC and
// can land on the previous day west of Greenwich, which would silently
// shift every date the user picks.

function parseISO(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
