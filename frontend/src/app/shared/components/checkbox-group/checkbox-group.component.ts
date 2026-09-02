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

export interface CheckboxOption {
  value: string | number;
  label: string;
  /** Optional bootstrap-icon class, e.g. `bi-life-preserver`. */
  icon?: string;
  disabled?: boolean;
}

/**
 * Themed multi-select "pill" group — same look as {@link RadioGroupComponent}
 * (`rg-*` classes, shared scss) but toggles membership in an array value
 * instead of picking one option. Used where several options can be active
 * at once, e.g. a community's Help / Emergency / Enquire modes.
 *
 * Works with `formControlName`, `[(ngModel)]` and `[ngModel]`+`(ngModelChange)`.
 */
@Component({
  selector: 'app-checkbox-group',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CheckboxGroupComponent), multi: true },
  ],
  template: `
    <div
      class="rg-group"
      [class.rg-group--card]="variant() === 'card'"
      [class.rg-group--error]="invalid()"
      role="group"
      [attr.aria-label]="ariaLabel() || null"
    >
      @for (opt of options(); track opt.value) {
        <button
          type="button"
          role="checkbox"
          class="rg-opt"
          [class.rg-opt--active]="isSelected(opt.value)"
          [attr.aria-checked]="isSelected(opt.value)"
          [disabled]="isDisabled() || !!opt.disabled"
          (click)="toggle(opt)"
        >
          @if (opt.icon) {
            <i class="bi {{ opt.icon }} rg-opt__icon" aria-hidden="true"></i>
          }
          <span class="rg-opt__label">{{ opt.label | translate }}</span>
        </button>
      }
    </div>
  `,
  styleUrls: ['../radio-group/radio-group.component.scss'],
})
export class CheckboxGroupComponent implements ControlValueAccessor {

  readonly options   = input<CheckboxOption[]>([]);
  /** `pill` = horizontal segmented control; `card` = icon-above-label grid. */
  readonly variant   = input<'pill' | 'card'>('pill');
  readonly ariaLabel = input<string>('');
  /** Paints the error border. */
  readonly invalid   = input<boolean>(false);

  protected value      = signal<(string | number)[]>([]);
  protected isDisabled = signal(false);

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: (string | number)[]) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: (string | number)[] | null): void {
    this.value.set(Array.isArray(v) ? [...v] : []);
  }
  registerOnChange(fn: (v: (string | number)[]) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  // ── Interaction ───────────────────────────────────────────────
  protected isSelected(v: string | number): boolean {
    return this.value().includes(v);
  }

  protected toggle(opt: CheckboxOption): void {
    if (this.isDisabled() || opt.disabled) return;
    const next = this.isSelected(opt.value)
      ? this.value().filter((v) => v !== opt.value)
      : [...this.value(), opt.value];
    this.value.set(next);
    this._onChange(next);
    this._onTouched();
  }
}
