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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

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
            @if (remoteLoading()) {
              <li class="ss-no-results"><span class="spinner-border spinner-border-sm"></span></li>
            } @else {
              @for (opt of displayOptions(); track opt.value) {
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
  /**
   * Opt-in server-side search mode (e.g. for a worldwide city list that's
   * too large to load into `options` wholesale). When set, the dropdown
   * calls this (debounced) instead of filtering `options` in-memory.
   * Every other existing usage (this input left unset) is unaffected.
   */
  readonly remoteSearchFn    = input<((query: string) => Observable<SelectOption[]>) | null>(null);
  /**
   * Lets the parent seed the displayed label for the current value without
   * a search round-trip — needed in remote-search mode when a value is set
   * programmatically (e.g. resurrecting an edit form) before any search has
   * run, so `options`/the not-yet-fetched remote list don't contain it yet.
   */
  readonly selectedOption    = input<SelectOption | null>(null);

  private readonly hostEl = inject(ElementRef<HTMLElement>);

  // ── State (Signals) ──────────────────────────────────────────
  protected value      = signal<string | number | null>(null);
  protected isOpen     = signal(false);
  protected isDisabled = signal(false);

  /** Plain string bound via ngModel — mirrors to _querySig for computed reactivity. */
  protected query   = '';
  private _querySig = signal('');

  protected remoteOptions = signal<SelectOption[]>([]);
  protected remoteLoading = signal(false);
  private searchInput$ = new Subject<string>();

  constructor() {
    this.searchInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          const fn = this.remoteSearchFn();
          if (!fn) return of<SelectOption[]>([]);
          this.remoteLoading.set(true);
          return fn(q).pipe(catchError(() => of<SelectOption[]>([])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((results) => {
        this.remoteOptions.set(results);
        this.remoteLoading.set(false);
      });
  }

  // ── Computed ─────────────────────────────────────────────────
  protected filteredOptions = computed(() => {
    const q = this._querySig().trim().toLowerCase();
    return q
      ? this.options().filter(o => o.label.toLowerCase().includes(q))
      : this.options();
  });

  /** Options actually rendered — remote results when in remote-search mode, else the in-memory filtered list. */
  protected displayOptions = computed(() =>
    this.remoteSearchFn() ? this.remoteOptions() : this.filteredOptions()
  );

  protected selectedLabel = computed(() => {
    const v = this.value();
    if (v == null) return '';
    const fromOptions = this.options().find(o => o.value === v)?.label;
    if (fromOptions) return fromOptions;
    const fromRemote = this.remoteOptions().find(o => o.value === v)?.label;
    if (fromRemote) return fromRemote;
    const seeded = this.selectedOption();
    if (seeded && seeded.value === v) return seeded.label;
    return '';
  });

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: string | number | null) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: string | number | null): void {
    const next = v ?? null;
    // Externally cleared (e.g. a parent form resets this field because a
    // preceding field — like Country — changed): also drop any cached
    // remote-search results. Otherwise, in remote-search mode, reopening
    // the dropdown could still show/select from the previous parent's
    // stale result set instead of fetching a fresh, correctly-scoped one.
    if (next == null && this.value() != null && this.remoteSearchFn()) {
      this.remoteOptions.set([]);
    }
    this.value.set(next);
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
    if (this.isOpen() && this.remoteSearchFn() && this.remoteOptions().length === 0 && !this.remoteLoading()) {
      // Show a default list as soon as the panel opens, before the admin types anything.
      this.searchInput$.next('');
    }
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
    if (this.remoteSearchFn()) this.searchInput$.next(val);
  }

  protected clearSearch(): void {
    this.query = '';
    this._querySig.set('');
    if (this.remoteSearchFn()) this.searchInput$.next('');
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
