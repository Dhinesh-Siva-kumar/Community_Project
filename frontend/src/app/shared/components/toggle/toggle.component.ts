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

/**
 * Themed on/off switch — the single implementation replacing the two
 * bespoke ones this app had grown (`.cm-switch` in the community/business
 * form modals and `.ntf-switch` in notification preferences).
 *
 * Renders a real `<button role="switch">` rather than a hidden checkbox, so
 * it's keyboard- and screen-reader-correct without needing the surrounding
 * `<label>` wrapper the old markup relied on.
 *
 * Works with `formControlName`, `[(ngModel)]` and `[ngModel]`+`(ngModelChange)`.
 */
@Component({
  selector: 'app-toggle',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ToggleComponent), multi: true },
  ],
  template: `
    <button
      type="button"
      role="switch"
      class="tg-switch"
      [class.tg-switch--on]="checked()"
      [class.tg-switch--sm]="size() === 'sm'"
      [disabled]="isDisabled()"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="ariaLabel() || label() || ('components.toggle.default' | translate)"
      (click)="toggle()"
    >
      <span class="tg-track" aria-hidden="true">
        <span class="tg-thumb"></span>
      </span>
      @if (label()) {
        <span class="tg-label">{{ label() | translate }}</span>
      }
    </button>
  `,
  styleUrls: ['./toggle.component.scss'],
})
export class ToggleComponent implements ControlValueAccessor {

  /** Optional text rendered beside the switch. Omit to render the switch alone. */
  readonly label     = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly size      = input<'sm' | 'md'>('md');

  protected checked    = signal(false);
  protected isDisabled = signal(false);

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: boolean) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: boolean | null): void { this.checked.set(!!v); }
  registerOnChange(fn: (v: boolean) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled.set(disabled); }

  protected toggle(): void {
    if (this.isDisabled()) return;
    const next = !this.checked();
    this.checked.set(next);
    this._onChange(next);
    this._onTouched();
  }
}
