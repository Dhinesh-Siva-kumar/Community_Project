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
 * Themed replacement for `<input type="time">`.
 *
 * Keeps the native **value format** (24-hour `HH:mm`) so existing form
 * controls, validators (e.g. the end-after-start checks on events) and API
 * payloads keep working untouched — but presents a friendlier 12-hour
 * hour/minute/meridiem picker in the app's amber theme.
 *
 * Works with `formControlName`, `[(ngModel)]` and `[ngModel]`+`(ngModelChange)`.
 */
@Component({
  selector: 'app-time-input',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeInputComponent), multi: true },
  ],
  templateUrl: './time-input.component.html',
  styleUrls: ['./time-input.component.scss'],
})
export class TimeInputComponent implements ControlValueAccessor {

  // ── Inputs ────────────────────────────────────────────────────
  readonly placeholder = input<string>('Select time');
  /** Granularity of the minute column. */
  readonly minuteStep  = input<number>(5);
  readonly ariaLabel   = input<string>('');
  readonly clearable   = input<boolean>(true);
  /** Paints the error border — mirrors the `.cm-input-error` modifier. */
  readonly invalid     = input<boolean>(false);

  // Explicit type argument on `inject` (rather than `inject(ElementRef<HTMLElement>)`)
  // so `nativeElement` is a real HTMLElement — the instantiation-expression
  // form resolves to an untyped call and loses the element typing.
  private readonly hostEl     = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  // ── State ─────────────────────────────────────────────────────
  /** Committed value as 24h `HH:mm`, or '' when empty. */
  protected value      = signal<string>('');
  protected isOpen     = signal(false);
  protected isDisabled = signal(false);
  protected dropUp     = signal(false);

  protected readonly hours12 = Array.from({ length: 12 }, (_, i) => i + 1);

  constructor() {
    const onDocClick = (e: MouseEvent) => {
      if (this.isOpen() && !this.hostEl.nativeElement.contains(e.target as Node)) {
        this.close();
      }
    };
    document.addEventListener('click', onDocClick, true);
    this.destroyRef.onDestroy(() => document.removeEventListener('click', onDocClick, true));
  }

  // ── Derived ───────────────────────────────────────────────────
  private parts = computed(() => parseTime(this.value()));

  protected displayText = computed(() => {
    const p = this.parts();
    if (!p) return '';
    const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
    return `${h12}:${String(p.m).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
  });

  protected selectedHour12 = computed(() => {
    const p = this.parts();
    if (!p) return null;
    return p.h % 12 === 0 ? 12 : p.h % 12;
  });

  protected selectedMinute  = computed(() => this.parts()?.m ?? null);
  protected selectedMeridiem = computed<'AM' | 'PM' | null>(() => {
    const p = this.parts();
    return p ? (p.h < 12 ? 'AM' : 'PM') : null;
  });

  /**
   * Minute options at the configured step — plus the currently-selected
   * minute if it happens to be off-step (e.g. an existing record saved as
   * 09:37), so editing such a value doesn't silently snap it to :35.
   */
  protected minutes = computed(() => {
    const step = Math.max(1, Math.min(30, this.minuteStep()));
    const list: number[] = [];
    for (let m = 0; m < 60; m += step) list.push(m);
    const sel = this.selectedMinute();
    if (sel != null && !list.includes(sel)) {
      list.push(sel);
      list.sort((a, b) => a - b);
    }
    return list;
  });

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: string) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: string | null): void { this.value.set(v ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  // ── Interaction ───────────────────────────────────────────────
  protected toggle(): void {
    if (this.isDisabled()) return;
    if (this.isOpen()) { this.close(); return; }
    const rect = this.hostEl.nativeElement.getBoundingClientRect();
    this.dropUp.set(window.innerHeight - rect.bottom < 300 && rect.top > 300);
    this.isOpen.set(true);
    // Bring the active rows into view once the columns have rendered.
    setTimeout(() => this.scrollActiveIntoView(), 0);
  }

  protected close(): void {
    this.isOpen.set(false);
    this._onTouched();
  }

  protected pickHour(h12: number): void {
    const p = this.parts();
    const meridiem = this.selectedMeridiem() ?? (h12 >= 8 ? 'AM' : 'AM');
    this.commit(to24(h12, p?.m ?? 0, meridiem));
  }

  protected pickMinute(m: number): void {
    const h12 = this.selectedHour12() ?? 9;
    const meridiem = this.selectedMeridiem() ?? 'AM';
    this.commit(to24(h12, m, meridiem));
  }

  protected pickMeridiem(meridiem: 'AM' | 'PM'): void {
    const h12 = this.selectedHour12() ?? 9;
    const m   = this.selectedMinute() ?? 0;
    this.commit(to24(h12, m, meridiem));
  }

  protected selectNow(): void {
    const now = new Date();
    const step = Math.max(1, Math.min(30, this.minuteStep()));
    // Snap to the nearest step so "Now" lands on a value the minute
    // column can actually highlight.
    const snapped = Math.round(now.getMinutes() / step) * step;
    const carry   = snapped >= 60;
    const h       = (now.getHours() + (carry ? 1 : 0)) % 24;
    const m       = carry ? 0 : snapped;
    this.commit(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    this.close();
  }

  protected clear(e: Event): void {
    e.stopPropagation();
    this.commit('');
    this.close();
  }

  private commit(v: string): void {
    this.value.set(v);
    this._onChange(v);
    this._onTouched();
  }

  private scrollActiveIntoView(): void {
    this.hostEl.nativeElement
      .querySelectorAll<HTMLElement>('.ti-col .ti-opt--active')
      .forEach(el => el.scrollIntoView({ block: 'center' }));
  }
}

// ── Time helpers ────────────────────────────────────────────────
function parseTime(s: string): { h: number; m: number } | null {
  if (!s) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!match) return null;
  const h = +match[1];
  const m = +match[2];
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function to24(h12: number, m: number, meridiem: 'AM' | 'PM'): string {
  let h = h12 % 12;
  if (meridiem === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
