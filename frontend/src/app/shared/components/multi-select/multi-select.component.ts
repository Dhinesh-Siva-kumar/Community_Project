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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { SelectOption } from '../searchable-select/searchable-select.component';

/**
 * Chip-based multi-select bound to a `(string | number)[]` value, capped at
 * `max` selections. Selected options render as removable chips; an "Add"
 * trigger opens a searchable dropdown of the remaining (not-yet-selected)
 * options — hidden once `max` is reached.
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MultiSelectComponent), multi: true },
  ],
  template: `
    <div class="ms-host" [class.ms-host--disabled]="isDisabled()">
      <div class="ms-chips-row" [attr.aria-expanded]="isOpen()">
        @for (chip of selectedChips(); track chip.value) {
          <span class="ms-chip">
            @if (chip.icon) {
              <i class="bi {{ chip.icon }} ms-chip__icon"></i>
            }
            <span class="ms-chip__label">{{ tr(chip.label) }}</span>
            @if (!isDisabled()) {
              <button
                type="button"
                class="ms-chip__remove"
                [attr.aria-label]="'components.multiSelect.remove' | translate"
                (click)="removeOption(chip.value)"
              >
                <i class="bi bi-x"></i>
              </button>
            }
          </span>
        }
        @if (!atMax() && !isDisabled()) {
          <button type="button" class="ms-add-trigger" (click)="toggleDropdown()" [attr.aria-expanded]="isOpen()">
            <i class="bi bi-plus-lg"></i>
            <span>{{ (selectedChips().length ? 'components.multiSelect.addMore' : placeholder()) | translate }}</span>
          </button>
        }
      </div>

      @if (atMax()) {
        <div class="ms-max-hint">{{ 'components.multiSelect.maxReached' | translate:{ max: max() } }}</div>
      }

      @if (isOpen()) {
        <div class="ms-panel" role="listbox">
          <div class="ms-search-wrap">
            <i class="bi bi-search ms-search-icon"></i>
            <input
              type="text"
              class="ms-search"
              [(ngModel)]="query"
              (ngModelChange)="onQueryChange($event)"
              [placeholder]="searchPlaceholder() || ('dropdown.search' | translate)"
              autocomplete="off"
            />
          </div>
          <ul class="ms-list" role="listbox">
            @for (opt of availableOptions(); track opt.value) {
              <li class="ms-option" role="option" (click)="addOption(opt)">
                <span class="ms-option-label">
                  @if (opt.icon) {
                    <i class="bi {{ opt.icon }} ms-option-icon"></i>
                  }
                  {{ tr(opt.label) }}
                </span>
                <i class="bi bi-plus ms-add-icon"></i>
              </li>
            } @empty {
              <li class="ms-no-results">{{ 'dropdown.no_results' | translate }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [`
    .ms-host { position: relative; }

    .ms-chips-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-height: 42px;
      padding: 6px 8px;
      border: 1.5px solid #E7E5E4;
      border-radius: 12px;
      background: #fff;
    }
    .ms-host--disabled .ms-chips-row { background: #F5F5F4; opacity: 0.65; }

    .ms-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px 3px 10px;
      background: #FEF3C7;
      border: 1px solid #FDE68A;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #92400E;
      white-space: nowrap;
    }
    .ms-chip__remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      background: rgba(146, 64, 14, 0.15);
      border-radius: 50%;
      color: #92400E;
      font-size: 0.65rem;
      cursor: pointer;
      padding: 0;
      transition: background 100ms ease;
    }
    .ms-chip__remove:hover { background: rgba(146, 64, 14, 0.3); }
    .ms-chip__icon { font-size: 0.75rem; color: #92400E; }

    .ms-add-trigger {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border: 1.5px dashed #D6D3D1;
      border-radius: 9999px;
      background: transparent;
      color: #57534E;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: border-color 150ms ease, color 150ms ease;
    }
    .ms-add-trigger:hover { border-color: #FBBF24; color: #92400E; }

    .ms-max-hint {
      margin-top: 4px;
      font-size: 0.75rem;
      color: #A8A29E;
    }

    .ms-panel {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      z-index: 20;
      background: #fff;
      border: 1.5px solid #E7E5E4;
      border-radius: 12px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
      overflow: hidden;
    }
    .ms-search-wrap {
      position: relative;
      padding: 8px;
      border-bottom: 1px solid #F0EEED;
    }
    .ms-search-icon {
      position: absolute;
      left: 18px;
      top: 50%;
      transform: translateY(-50%);
      color: #A8A29E;
      font-size: 0.8rem;
    }
    .ms-search {
      width: 100%;
      border: 1px solid #E7E5E4;
      border-radius: 8px;
      padding: 6px 10px 6px 28px;
      font-size: 0.8125rem;
      outline: none;
    }
    .ms-search:focus { border-color: #FBBF24; }

    .ms-list {
      list-style: none;
      margin: 0;
      padding: 4px;
      max-height: 220px;
      overflow-y: auto;
    }
    .ms-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 0.8125rem;
      color: #292524;
      cursor: pointer;
    }
    .ms-option:hover { background: #FFFBEB; }
    .ms-option-icon { color: #A8A29E; font-size: 0.8rem; margin-right: 6px; }
    .ms-add-icon { color: #A8A29E; font-size: 0.8rem; }
    .ms-no-results {
      padding: 10px;
      text-align: center;
      font-size: 0.8125rem;
      color: #A8A29E;
    }
  `],
})
export class MultiSelectComponent implements ControlValueAccessor {
  private translate = inject(TranslateService);
  private language = inject(LanguageService);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Reads the language signal so this OnPush component re-renders its option
   * labels on a language switch — see SearchableSelectComponent.tr(). */
  protected tr(label: string): string {
    this.language.currentLang();
    return this.translate.instant(label) as string;
  }

  readonly options           = input<SelectOption[]>([]);
  readonly placeholder       = input<string>('Add...');
  readonly searchPlaceholder = input<string>('');
  readonly max               = input<number>(3);

  protected value      = signal<(string | number)[]>([]);
  protected isOpen     = signal(false);
  protected isDisabled = signal(false);
  protected query      = '';
  private _querySig    = signal('');

  constructor() {
    const onDocumentClick = (e: MouseEvent) => {
      if (!this.hostEl.nativeElement.contains(e.target as Node) && this.isOpen()) {
        this.isOpen.set(false);
        this._onTouched();
      }
    };
    document.addEventListener('click', onDocumentClick, true);
    this.destroyRef.onDestroy(() => document.removeEventListener('click', onDocumentClick, true));
  }

  protected selectedChips = computed(() => {
    const selected = new Set(this.value());
    return this.options().filter(o => selected.has(o.value));
  });

  protected availableOptions = computed(() => {
    const selected = new Set(this.value());
    const q = this._querySig().trim().toLowerCase();
    return this.options()
      .filter(o => !selected.has(o.value))
      .filter(o => !q || this.tr(o.label).toLowerCase().includes(q));
  });

  protected atMax = computed(() => this.value().length >= this.max());

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: (string | number)[]) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: (string | number)[] | null): void {
    this.value.set(Array.isArray(v) ? [...v] : []);
  }
  registerOnChange(fn: (v: (string | number)[]) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
    if (disabled) this.isOpen.set(false);
  }

  // ── Interaction ───────────────────────────────────────────────
  protected toggleDropdown(): void {
    if (this.isDisabled() || this.atMax()) return;
    this.isOpen.update(v => !v);
    if (!this.isOpen()) this._onTouched();
  }

  protected addOption(opt: SelectOption): void {
    if (this.atMax()) return;
    const next = [...this.value(), opt.value];
    this.value.set(next);
    this._onChange(next);
    this._onTouched();
    this.query = '';
    this._querySig.set('');
    if (next.length >= this.max()) this.isOpen.set(false);
  }

  protected removeOption(val: string | number): void {
    const next = this.value().filter(v => v !== val);
    this.value.set(next);
    this._onChange(next);
    this._onTouched();
  }

  protected onQueryChange(val: string): void {
    this._querySig.set(val);
  }
}
