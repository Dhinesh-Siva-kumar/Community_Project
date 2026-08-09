import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SortField {
  key: string;
  label: string;
}

export type SortDir = 'asc' | 'desc';

export interface SortChange {
  sortBy: string;
  sortDir: SortDir;
}

// Clickable field labels standing in for sortable table columns on card/grid
// list pages — same asc/desc-toggle-with-arrow interaction as clicking a
// <th>, without needing those pages rewritten as tables.
@Component({
  selector: 'app-sort-bar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sb-host">
      <span class="sb-label">Sort by</span>
      @for (f of fields(); track f.key) {
        <button
          type="button"
          class="sb-field"
          [class.sb-field-active]="sortBy() === f.key"
          (click)="select(f.key)"
        >
          {{ f.label }}
          <i class="bi sb-field-icon"
            [class.bi-arrow-up]="sortBy() === f.key && sortDir() === 'asc'"
            [class.bi-arrow-down]="sortBy() === f.key && sortDir() === 'desc'"
            [class.bi-arrow-down-up]="sortBy() !== f.key"
          ></i>
        </button>
      }
    </div>
  `,
  styles: [`
    .sb-host {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .sb-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--sb-muted, #78716c);
      margin-right: 2px;
    }

    .sb-field {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1.5px solid var(--sb-border, #e7e5e4);
      background: transparent;
      color: var(--sb-text, #57534e);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--sb-accent, #f59e0b);
        color: var(--sb-accent-text, #92400e);
      }
    }

    .sb-field-active {
      background: var(--sb-accent-bg, #fffbeb);
      border-color: var(--sb-accent, #f59e0b);
      color: var(--sb-accent-text, #92400e);
    }

    .sb-field-icon { font-size: 11px; opacity: 0.85; }
    .sb-field:not(.sb-field-active) .sb-field-icon { opacity: 0.45; }
  `],
})
export class SortBarComponent {
  readonly fields  = input<SortField[]>([]);
  readonly sortBy  = input<string>('');
  readonly sortDir = input<SortDir>('desc');

  readonly sortChange = output<SortChange>();

  select(key: string): void {
    const nextDir: SortDir = this.sortBy() === key && this.sortDir() === 'desc' ? 'asc' : 'desc';
    this.sortChange.emit({ sortBy: key, sortDir: nextDir });
  }
}
