import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { TagInputComponent } from '../tag-input/tag-input.component';
import { TranslatePipe } from '@ngx-translate/core';

// Single shared definition of the "Community Rules" field (label + tag-input
// config) so every create/edit form for a community uses the exact same
// rules — max length, item label, no comma-splitting — instead of each page
// repeating (and risking drifting) its own copy of these settings.
@Component({
  selector: 'app-community-rules-input',
  standalone: true,
  imports: [ReactiveFormsModule, TagInputComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CommunityRulesInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="cri-field">
      <label class="cri-label">{{ 'components.rulesInput.label' | translate }}</label>
      <app-tag-input
        [formControl]="control"
        [placeholder]="'components.rulesInput.placeholder' | translate"
        itemLabel="rule"
        [maxLength]="150"
        [commitOnComma]="false"
      ></app-tag-input>
    </div>
  `,
  styles: [`
    .cri-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #44403c;
      margin-bottom: 6px;
    }
  `],
})
export class CommunityRulesInputComponent implements ControlValueAccessor {
  protected control = new FormControl<string[]>([], { nonNullable: true });

  private _onChange: (v: string[]) => void = () => {};
  private _onTouched: () => void = () => {};

  constructor() {
    this.control.valueChanges.subscribe((v) => {
      this._onChange(v);
      this._onTouched();
    });
  }

  writeValue(v: string[] | null): void {
    this.control.setValue(Array.isArray(v) ? v : [], { emitEvent: false });
  }

  registerOnChange(fn: (v: string[]) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }

  setDisabledState(disabled: boolean): void {
    if (disabled) {
      this.control.disable({ emitEvent: false });
    } else {
      this.control.enable({ emitEvent: false });
    }
  }
}
