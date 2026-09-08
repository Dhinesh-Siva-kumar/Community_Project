import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  ControlValueAccessor,
  FormsModule,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { TimeInputComponent } from '../time-input/time-input.component';
import { RadioGroupComponent, RadioOption } from '../radio-group/radio-group.component';
import type { OpeningDayKey, OpeningHoursDay, OpeningHoursJson } from '../../../core/models';
import { DAY_KEYS, DAY_LABEL_KEYS, DAY_SHORT_KEYS } from '../../utils/opening-hours';

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

/**
 * Opening days + hours editor.
 *
 * Replaces the old fixed 30-minute dropdown pair (which could only express a
 * single range shared by every day) with two modes:
 *
 *   SAME    — pick days, set one common open/close time for all of them.
 *   PER_DAY — pick days, then give each its own open/close time.
 *
 * Times are edited with the existing `app-time-input`, whose value format
 * (24h `HH:mm`) is already exactly the storage format, so no conversion
 * happens anywhere in this component.
 *
 * Implements both CVA and Validator, so it drops into a reactive form as
 * `formControlName="openingHoursJson"` and reports its own incompleteness
 * rather than needing the host to duplicate the rules.
 */
@Component({
  selector: 'app-opening-hours-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, TimeInputComponent, RadioGroupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => OpeningHoursEditorComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => OpeningHoursEditorComponent), multi: true },
  ],
  templateUrl: './opening-hours-editor.component.html',
  styleUrls: ['./opening-hours-editor.component.scss'],
})
export class OpeningHoursEditorComponent implements ControlValueAccessor, Validator {

  /** Paints the error state once the host decides the field has been touched. */
  readonly invalid = input<boolean>(false);

  protected readonly DAY_KEYS = DAY_KEYS;
  protected readonly DAY_SHORT_KEYS = DAY_SHORT_KEYS;
  protected readonly DAY_LABEL_KEYS = DAY_LABEL_KEYS;

  protected readonly modeOptions: RadioOption[] = [
    { value: 'SAME', label: 'components.openingHours.modeSame' },
    { value: 'PER_DAY', label: 'components.openingHours.modePerDay' },
  ];

  // ── State ─────────────────────────────────────────────────────
  protected mode = signal<'SAME' | 'PER_DAY'>('SAME');
  protected selected = signal<OpeningDayKey[]>([]);
  /** The one shared range used in SAME mode. */
  protected sameOpen = signal<string>(DEFAULT_OPEN);
  protected sameClose = signal<string>(DEFAULT_CLOSE);
  protected same24h = signal<boolean>(false);
  /** Per-day ranges used in PER_DAY mode. */
  protected perDay = signal<Partial<Record<OpeningDayKey, OpeningHoursDay>>>({});
  protected isDisabled = signal(false);

  /** Selected days in canonical Mon→Sun order, for the PER_DAY rows. */
  protected orderedSelection = computed(() =>
    DAY_KEYS.filter((k) => this.selected().includes(k)),
  );

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: OpeningHoursJson | null) => void = () => {};
  private _onTouched: () => void = () => {};
  private _onValidatorChange: () => void = () => {};

  writeValue(v: OpeningHoursJson | null): void {
    if (!v || !v.days) {
      this.mode.set('SAME');
      this.selected.set([]);
      this.perDay.set({});
      this.sameOpen.set(DEFAULT_OPEN);
      this.sameClose.set(DEFAULT_CLOSE);
      this.same24h.set(false);
      return;
    }

    const keys = DAY_KEYS.filter((k) => v.days[k]);
    this.mode.set(v.mode === 'PER_DAY' ? 'PER_DAY' : 'SAME');
    this.selected.set(keys);
    this.perDay.set({ ...v.days });

    // Seed the shared controls from the first selected day so switching to
    // SAME mode has something sensible to collapse onto.
    const first = keys.length ? v.days[keys[0]] : undefined;
    this.sameOpen.set(first?.open ?? DEFAULT_OPEN);
    this.sameClose.set(first?.close ?? DEFAULT_CLOSE);
    this.same24h.set(!!first?.is24h);
  }

  registerOnChange(fn: (v: OpeningHoursJson | null) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  // ── Validator ─────────────────────────────────────────────────
  registerOnValidatorChange(fn: () => void): void { this._onValidatorChange = fn; }

  validate(_control: AbstractControl): ValidationErrors | null {
    if (this.selected().length === 0) return { openingDaysRequired: true };

    // An overnight range (close < open) is legitimate — a bar open
    // 20:00–02:00 — so only *missing* times are an error, never ordering.
    const incomplete = this.mode() === 'SAME'
      ? !this.sameOpen() || !this.sameClose()
      : this.orderedSelection().some((k) => {
          const d = this.perDay()[k];
          return !d?.open || !d?.close;
        });

    return incomplete ? { openingHoursIncomplete: true } : null;
  }

  // ── Interaction ───────────────────────────────────────────────
  protected toggleDay(day: OpeningDayKey): void {
    if (this.isDisabled()) return;

    const isOn = this.selected().includes(day);
    this.selected.update((d) => (isOn ? d.filter((x) => x !== day) : [...d, day]));

    this.perDay.update((p) => {
      const next = { ...p };
      if (isOn) delete next[day];
      // A newly selected day starts from the shared range so PER_DAY mode
      // never presents an empty row the user has to fill from scratch.
      else next[day] = this.sharedRange();
      return next;
    });

    this.emit();
  }

  protected setMode(mode: string | number | null): void {
    const next = mode === 'PER_DAY' ? 'PER_DAY' : 'SAME';
    if (next === this.mode()) return;

    if (next === 'PER_DAY') {
      // Seed every selected day from the shared range, so the per-day rows
      // start where the common range left off.
      const shared = this.sharedRange();
      this.perDay.set(Object.fromEntries(this.selected().map((k) => [k, { ...shared }])));
    } else {
      // Collapsing: the first selected day's range becomes the common one.
      const first = this.orderedSelection()[0];
      const d = first ? this.perDay()[first] : undefined;
      if (d) {
        this.sameOpen.set(d.open);
        this.sameClose.set(d.close);
        this.same24h.set(!!d.is24h);
      }
    }

    this.mode.set(next);
    this.emit();
  }

  protected setSameTime(which: 'open' | 'close', value: string): void {
    (which === 'open' ? this.sameOpen : this.sameClose).set(value ?? '');
    this.same24h.set(false);
    this.emit();
  }

  protected setDayTime(day: OpeningDayKey, which: 'open' | 'close', value: string): void {
    this.perDay.update((p) => ({
      ...p,
      [day]: { ...(p[day] ?? this.sharedRange()), [which]: value ?? '', is24h: false },
    }));
    this.emit();
  }

  protected toggleSame24h(): void {
    const next = !this.same24h();
    this.same24h.set(next);
    if (next) { this.sameOpen.set('00:00'); this.sameClose.set('23:59'); }
    this.emit();
  }

  protected toggleDay24h(day: OpeningDayKey): void {
    this.perDay.update((p) => {
      const current = p[day] ?? this.sharedRange();
      const next = !current.is24h;
      return {
        ...p,
        [day]: next
          ? { open: '00:00', close: '23:59', is24h: true }
          : { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
      };
    });
    this.emit();
  }

  protected dayOf(day: OpeningDayKey): OpeningHoursDay {
    return this.perDay()[day] ?? this.sharedRange();
  }

  private sharedRange(): OpeningHoursDay {
    return this.same24h()
      ? { open: '00:00', close: '23:59', is24h: true }
      : { open: this.sameOpen() || DEFAULT_OPEN, close: this.sameClose() || DEFAULT_CLOSE };
  }

  /** Rebuilds the value from the current state and pushes it to the form. */
  private emit(): void {
    const keys = this.orderedSelection();
    if (keys.length === 0) {
      this._onChange(null);
      this._onTouched();
      this._onValidatorChange();
      return;
    }

    const days: Partial<Record<OpeningDayKey, OpeningHoursDay>> = {};
    if (this.mode() === 'SAME') {
      const shared = this.sharedRange();
      for (const k of keys) days[k] = { ...shared };
    } else {
      for (const k of keys) days[k] = { ...this.dayOf(k) };
    }

    this._onChange({ mode: this.mode(), days });
    this._onTouched();
    this._onValidatorChange();
  }
}
