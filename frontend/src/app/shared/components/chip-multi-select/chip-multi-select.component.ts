import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

export interface SelectOption {
  value: string | number;
  label: string;
}

@Component({
  selector: 'app-chip-multi-select',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ChipMultiSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="cms-host">

      <!-- ── Field: chips + inline search ─────────────────── -->
      <div
        class="cms-field"
        [class.cms-focus]="isOpen()"
        [class.cms-disabled]="isDisabled()"
        (click)="onFieldClick()"
      >
        <!-- Selected chips -->
        @for (v of selectedValues(); track v) {
          <span class="cms-chip">
            <span class="cms-chip-label">{{ labelFor(v) }}</span>
            <button
              type="button"
              class="cms-chip-remove"
              [attr.aria-label]="'Remove ' + labelFor(v)"
              (click)="removeValue(v, $event)"
            >
              <i class="bi bi-x"></i>
            </button>
          </span>
        }

        <!-- Inline search input -->
        @if (!selectedValues().length || query) {
          <input
            type="text"
            class="cms-search"
            [(ngModel)]="query"
            (ngModelChange)="onQueryChange($event)"
            (focus)="onSearchFocus()"
            [placeholder]="!selectedValues().length
              ? (placeholder() || ('dropdown.select' | translate))
              : ('dropdown.search' | translate)"
            [disabled]="isDisabled()"
            autocomplete="off"
            aria-autocomplete="list"
          />
        } @else {
          <!-- Collapsed stub keeps the field clickable when chips fill the row -->
          <input
            type="text"
            class="cms-search cms-search-stub"
            [(ngModel)]="query"
            (ngModelChange)="onQueryChange($event)"
            (focus)="onSearchFocus()"
            [disabled]="isDisabled()"
            autocomplete="off"
            aria-autocomplete="list"
          />
        }
      </div>

      <!-- ── Dropdown list ─────────────────────────────────── -->
      @if (isOpen()) {
        <ul class="cms-panel cms-list" role="listbox">
          @for (opt of filteredOptions(); track opt.value) {
            <li
              class="cms-option"
              [class.cms-option-checked]="isSelected(opt.value)"
              role="option"
              [attr.aria-selected]="isSelected(opt.value)"
              (click)="toggleOption(opt)"
            >
              <span class="cms-checkbox" [class.cms-checkbox-checked]="isSelected(opt.value)">
                <i class="bi bi-check"></i>
              </span>
              <span class="cms-option-label">{{ opt.label }}</span>
            </li>
          } @empty {
            <li class="cms-no-results">{{ 'dropdown.no_results' | translate }}</li>
          }
        </ul>
      }

    </div>
  `,
})
export class ChipMultiSelectComponent implements ControlValueAccessor {

  // ── Inputs ────────────────────────────────────────────────────
  readonly options      = input<SelectOption[]>([]);
  readonly placeholder  = input<string>('');
  readonly maxSelection = input<number>(Infinity);

  private readonly hostEl = inject(ElementRef<HTMLElement>);

  // ── State (Signals) ──────────────────────────────────────────
  protected selectedValues = signal<(string | number)[]>([]);
  protected isOpen         = signal(false);
  protected isDisabled     = signal(false);

  /** Plain string bound via ngModel — mirrors to _querySig for computed reactivity. */
  protected query   = '';
  private _querySig = signal('');

  // ── Computed ─────────────────────────────────────────────────
  protected filteredOptions = computed(() => {
    const q = this._querySig().trim().toLowerCase();
    return q
      ? this.options().filter(o => o.label.toLowerCase().includes(q))
      : this.options();
  });

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: (string | number)[]) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: (string | number)[] | null): void {
    this.selectedValues.set(Array.isArray(v) ? [...v] : []);
  }

  registerOnChange(fn: (v: (string | number)[]) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
  }

  // ── Helpers ───────────────────────────────────────────────────
  protected isSelected(v: string | number): boolean {
    return this.selectedValues().includes(v);
  }

  protected labelFor(v: string | number): string {
    return this.options().find(o => o.value === v)?.label ?? String(v);
  }

  // ── Interaction ───────────────────────────────────────────────
  protected onFieldClick(): void {
    if (!this.isDisabled()) this.isOpen.set(true);
  }

  protected onSearchFocus(): void {
    if (!this.isDisabled()) this.isOpen.set(true);
  }

  protected toggleOption(opt: SelectOption): void {
    const current = this.selectedValues();
    let next: (string | number)[];

    if (current.includes(opt.value)) {
      next = current.filter(v => v !== opt.value);
    } else {
      if (current.length >= this.maxSelection()) return;
      next = [...current, opt.value];
    }

    this.selectedValues.set(next);
    this._onChange(next);
    // Keep the panel open for multi-pick; clear search to show full list
    this.query = '';
    this._querySig.set('');
  }

  protected removeValue(v: string | number, e: MouseEvent): void {
    e.stopPropagation();
    const next = this.selectedValues().filter(x => x !== v);
    this.selectedValues.set(next);
    this._onChange(next);
    this._onTouched();
  }

  protected onQueryChange(val: string): void {
    this._querySig.set(val);
    if (val) this.isOpen.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.hostEl.nativeElement.contains(e.target as Node)) {
      if (this.isOpen()) {
        this.isOpen.set(false);
        this.query = '';
        this._querySig.set('');
        this._onTouched();
      }
    }
  }
}
