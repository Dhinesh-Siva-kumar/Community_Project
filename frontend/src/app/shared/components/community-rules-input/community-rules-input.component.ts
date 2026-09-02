import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { TagInputComponent } from '../tag-input/tag-input.component';
import { TranslatePipe } from '@ngx-translate/core';

// Single shared definition of the "Community Rules" field (tag-input config)
// so every create/edit form for a community uses the exact same rules — max
// length, item label, no comma-splitting — instead of each page repeating
// (and risking drifting) its own copy of these settings.
//
// No label of its own — both call sites (admin-community.component.html,
// community-form-modal.component.html) already have a "Community Rules"
// section header right above this, so an internal label would be redundant.
// The host element itself needs `display: block` from the consumer (both
// call sites set it via `::ng-deep app-community-rules-input`), since
// unknown custom elements default to `display: inline` and would otherwise
// shrink-wrap instead of filling the input box.
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
    <app-tag-input
      [formControl]="control"
      [placeholder]="'components.rulesInput.placeholder' | translate"
      itemLabel="rule"
      [maxLength]="150"
      [commitOnComma]="false"
      [spellcheck]="true"
    ></app-tag-input>
  `,
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
