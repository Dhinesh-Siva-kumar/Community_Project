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
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="ss-host" [class.ss-open]="isOpen()">

      <!-- ── Trigger button ─────────────────────────────────── -->
      <button
        type="button"
        class="ss-trigger form-control"
        [class.ss-placeholder]="!selectedLabel()"
        [disabled]="isDisabled()"
        (click)="toggleDropdown()"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="listbox"
      >
        <span class="ss-trigger-text">{{ selectedLabel() || placeholder() }}</span>
        <i class="bi bi-chevron-down ss-caret" [class.ss-caret-open]="isOpen()"></i>
      </button>

      <!-- ── Dropdown panel ────────────────────────────────── -->
      @if (isOpen()) {
        <div class="ss-panel" role="listbox">

          <!-- Search input -->
          <div class="ss-search-wrap">
            <i class="bi bi-search ss-search-icon"></i>
            <input
              type="text"
              class="ss-search"
              [(ngModel)]="query"
              (ngModelChange)="onQueryChange($event)"
              [placeholder]="searchPlaceholder() || ('dropdown.search' | translate)"
              autocomplete="off"
              aria-label="Search options"
            />
            @if (query) {
              <button type="button" class="ss-clear-search" (click)="clearSearch()">
                <i class="bi bi-x"></i>
              </button>
            }
          </div>

          <!-- Options list -->
          <ul class="ss-list" role="listbox">
            @for (opt of filteredOptions(); track opt.value) {
              <li
                class="ss-option"
                [class.ss-option-selected]="opt.value === value()"
                role="option"
                [attr.aria-selected]="opt.value === value()"
                (click)="selectOption(opt)"
              >
                <span class="ss-option-label">{{ opt.label }}</span>
                @if (opt.value === value()) {
                  <i class="bi bi-check2 ss-check"></i>
                }
              </li>
            } @empty {
              <li class="ss-no-results">{{ 'dropdown.no_results' | translate }}</li>
            }
          </ul>

        </div>
      }

    </div>
  `,
})
export class SearchableSelectComponent implements ControlValueAccessor {

  // ── Inputs ────────────────────────────────────────────────────
  readonly options           = input<SelectOption[]>([]);
  readonly placeholder       = input<string>('Select...');
  readonly searchPlaceholder = input<string>('');

  private readonly hostEl = inject(ElementRef<HTMLElement>);

  // ── State (Signals) ──────────────────────────────────────────
  protected value      = signal<string | number | null>(null);
  protected isOpen     = signal(false);
  protected isDisabled = signal(false);

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

  protected selectedLabel = computed(() => {
    const v = this.value();
    return this.options().find(o => o.value === v)?.label ?? '';
  });

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: string | number | null) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: string | number | null): void {
    this.value.set(v ?? null);
  }

  registerOnChange(fn: (v: string | number | null) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
  }

  // ── Interaction ───────────────────────────────────────────────
  protected toggleDropdown(): void {
    if (this.isDisabled()) return;
    this.isOpen.update(v => !v);
    if (!this.isOpen()) this._onTouched();
  }

  protected selectOption(opt: SelectOption): void {
    this.value.set(opt.value);
    this._onChange(opt.value);
    this._onTouched();
    this.isOpen.set(false);
    this.query = '';
    this._querySig.set('');
  }

  protected onQueryChange(val: string): void {
    this._querySig.set(val);
  }

  protected clearSearch(): void {
    this.query = '';
    this._querySig.set('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.hostEl.nativeElement.contains(e.target as Node)) {
      if (this.isOpen()) {
        this.isOpen.set(false);
        this._onTouched();
      }
    }
  }
}
