import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagInputComponent),
      multi: true,
    },
  ],
  template: `
    <div
      class="tag-input-host"
      [class.tag-input-host--focus]="focused"
      [class.tag-input-host--disabled]="isDisabled()"
      (click)="focusInput()"
    >
      <!-- Rendered tag chips -->
      @for (tag of tags(); track tag) {
        <span class="tag-chip">
          <span class="tag-chip__label">{{ tag }}</span>
          <button
            type="button"
            class="tag-chip__remove"
            [attr.aria-label]="'Remove ' + tag"
            (click)="removeTag(tag, $event)"
          >
            <i class="bi bi-x"></i>
          </button>
        </span>
      }

      <!-- Free-text input -->
      <input
        #inputEl
        type="text"
        class="tag-input-host__field"
        [(ngModel)]="inputValue"
        [disabled]="isDisabled()"
        [placeholder]="tags().length === 0 ? placeholder() : ''"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        (keydown)="onKeydown($event)"
        (focus)="focused = true"
        (blur)="onBlur()"
      />
    </div>

    @if (tags().length > 0) {
      <div class="tag-input-hint">
        {{ tags().length }} skill{{ tags().length === 1 ? '' : 's' }} added
        &nbsp;·&nbsp;
        <button type="button" class="tag-input-clear-all" (click)="clearAll()">
          Clear all
        </button>
      </div>
    }
  `,
  styles: [`
    .tag-input-host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      min-height: 42px;
      padding: 6px 10px;
      border: 1.5px solid #E7E5E4;
      border-radius: 12px;
      background: #fff;
      cursor: text;
      transition: border-color 150ms ease, box-shadow 150ms ease;

      &--focus {
        border-color: #FBBF24;
        box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.18);
      }

      &--disabled {
        background: #F5F5F4;
        cursor: not-allowed;
        opacity: 0.65;
      }

      &__field {
        flex: 1;
        min-width: 120px;
        border: none;
        outline: none;
        background: transparent;
        font-size: 0.875rem;
        color: #292524;
        padding: 2px 0;

        &::placeholder { color: #A8A29E; }
        &:disabled { cursor: not-allowed; }
      }
    }

    .tag-chip {
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
      animation: tagIn 150ms ease;

      &__label { line-height: 1.4; }

      &__remove {
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

        &:hover { background: rgba(146, 64, 14, 0.3); }
      }
    }

    .tag-input-hint {
      margin-top: 4px;
      font-size: 0.75rem;
      color: #A8A29E;
    }

    .tag-input-clear-all {
      border: none;
      background: none;
      padding: 0;
      font-size: 0.75rem;
      color: #DC2626;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    @keyframes tagIn {
      from { opacity: 0; transform: scale(0.8); }
      to   { opacity: 1; transform: scale(1); }
    }
  `],
})
export class TagInputComponent implements ControlValueAccessor {

  // ── Inputs ────────────────────────────────────────────────────
  readonly placeholder = input<string>('Type a skill and press Enter…');

  @ViewChild('inputEl') inputElRef!: ElementRef<HTMLInputElement>;

  // ── State ─────────────────────────────────────────────────────
  protected tags        = signal<string[]>([]);
  protected isDisabled  = signal(false);
  protected inputValue  = '';
  protected focused     = false;

  // ── ControlValueAccessor ──────────────────────────────────────
  private _onChange: (v: string[]) => void = () => {};
  private _onTouched: () => void = () => {};

  writeValue(v: string[] | null): void {
    this.tags.set(Array.isArray(v) ? [...v] : []);
  }

  registerOnChange(fn: (v: string[]) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void          { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void         { this.isDisabled.set(disabled); }

  // ── Interaction ───────────────────────────────────────────────
  protected focusInput(): void {
    if (!this.isDisabled()) this.inputElRef?.nativeElement.focus();
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.commitTag();
    } else if (e.key === 'Backspace' && this.inputValue === '') {
      this.removeLastTag();
    }
  }

  protected onBlur(): void {
    this.focused = false;
    // Commit any pending text on blur
    this.commitTag();
    this._onTouched();
  }

  protected removeTag(tag: string, e: MouseEvent): void {
    e.stopPropagation();
    const next = this.tags().filter(t => t !== tag);
    this.tags.set(next);
    this._onChange(next);
    this._onTouched();
  }

  protected clearAll(): void {
    this.tags.set([]);
    this.inputValue = '';
    this._onChange([]);
    this._onTouched();
  }

  private commitTag(): void {
    const raw = this.inputValue.trim().replace(/,+$/, '').trim();
    if (!raw) return;

    const existing = this.tags();
    // Deduplicate (case-insensitive)
    if (existing.some(t => t.toLowerCase() === raw.toLowerCase())) {
      this.inputValue = '';
      return;
    }

    const next = [...existing, raw];
    this.tags.set(next);
    this._onChange(next);
    this.inputValue = '';
  }

  private removeLastTag(): void {
    const current = this.tags();
    if (!current.length) return;
    const next = current.slice(0, -1);
    this.tags.set(next);
    this._onChange(next);
  }
}
