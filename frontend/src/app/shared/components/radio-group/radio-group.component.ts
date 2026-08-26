import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

export interface RadioOption {
  value: string | number;
  label: string;
  /** Optional bootstrap-icon class, e.g. `bi-lock-fill`. */
  icon?: string;
  disabled?: boolean;
}

/**
 * Themed single-select radio group.
 *
 * Every radio in this app was already rendered as a segmented pill or an
 * icon card with the native `<input type="radio">` visually hidden, so this
 * takes an options array and owns that rendering directly — replacing the
 * duplicated `.cm-toggle-group`/`.cm-toggle-pill` and `.nm-recipient`
 * markup with one component.
 *
 * Uses roving-tabindex `role="radiogroup"` semantics: one tab stop for the
 * group, arrow keys to move between options.
 *
 * Works with `formControlName`, `[(ngModel)]` and `[ngModel]`+`(ngModelChange)`.
 */
@Component({
  selector: 'app-radio-group',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RadioGroupComponent), multi: true },
  ],
  template: `
    <div
      class="rg-group"
      [class.rg-group--card]="variant() === 'card'"
      [class.rg-group--error]="invalid()"
      role="radiogroup"
      [attr.aria-label]="ariaLabel() || null"
    >
      @for (opt of options(); track opt.value) {
        <button
          type="button"
          role="radio"
          class="rg-opt"
          [class.rg-opt--active]="opt.value === value()"
          [attr.aria-checked]="opt.value === value()"
          [disabled]="isDisabled() || !!opt.disabled"
          [tabindex]="tabIndexFor(opt)"
          (click)="select(opt)"
          (keydown)="onKeydown($event, $index)"
        >
          @if (opt.icon) {
            <i class="bi {{ opt.icon }} rg-opt__icon" aria-hidden="true"></i>
          }
          <span class="rg-opt__label">{{ opt.label | translate }}</span>
        </button>
      }
    </div>
  `,
  styleUrls: ['./radio-group.component.scss'],
})
export class RadioGroupComponent implements ControlValueAccessor {

  readonly options   = input<RadioOption[]>([]);
  /** `pill` = horizontal segmented control; `card` = icon-above-label grid. */
  readonly variant   = input<'pill' | 'card'>('pill');
  readonly ariaLabel = input<string>('');
  /** Paints the error border — mirrors the old `--error` modifier. */
  readonly invalid   = input<boolean>(false);

  protected value      = signal<string | number | null>(null);
  protected isDisabled = signal(false);

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: string | number | null) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: string | number | null): void { this.value.set(v ?? null); }
  registerOnChange(fn: (v: string | number | null) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  // ── Interaction ───────────────────────────────────────────────
  protected select(opt: RadioOption): void {
    if (this.isDisabled() || opt.disabled) return;
    this.value.set(opt.value);
    this._onChange(opt.value);
    this._onTouched();
  }

  /**
   * Roving tabindex: only the selected option (or the first enabled one
   * when nothing is selected yet) is in the tab order, so the group is a
   * single stop and arrow keys move within it.
   */
  protected tabIndexFor(opt: RadioOption): number {
    const v = this.value();
    if (v != null) return opt.value === v ? 0 : -1;
    const first = this.options().find(o => !o.disabled);
    return first && first.value === opt.value ? 0 : -1;
  }

  protected onKeydown(e: KeyboardEvent, index: number): void {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 :
      e.key === 'ArrowLeft'  || e.key === 'ArrowUp'   ? -1 : 0;
    if (!step) return;

    e.preventDefault();
    const opts = this.options();
    // Walk past any disabled options, wrapping around the ends.
    for (let i = 1; i <= opts.length; i++) {
      const next = opts[(index + step * i + opts.length * i) % opts.length];
      if (next && !next.disabled) {
        this.select(next);
        const btns = (e.currentTarget as HTMLElement).parentElement
          ?.querySelectorAll<HTMLButtonElement>('.rg-opt');
        btns?.[opts.indexOf(next)]?.focus();
        return;
      }
    }
  }
}
