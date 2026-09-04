import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener, OnChanges, SimpleChanges, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

export interface ProfileTab {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
  disabled?: boolean;
  /** Optional per-tab accent (text/icon when active) — falls back to the default theme color when omitted. */
  color?: string;
  /** Optional per-tab light background (active pill / sliding indicator) — falls back to the default card color when omitted. */
  bgColor?: string;
}

@Component({
  selector: 'app-profile-tabs',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-tabs.component.html',
  styleUrls: ['./profile-tabs.component.scss'],
})
export class ProfileTabsComponent implements OnChanges {
  @Input() tabs: ProfileTab[] = [];
  @Input() activeTab = '';
  /** Equal-width tabs filling one row, with a sliding active indicator. */
  @Input() fullWidth = false;
  @Output() tabChange = new EventEmitter<string>();

  @ViewChildren('tabBtn') private tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;
  private focusOnNextChange = false;

  get activeIndex(): number {
    const idx = this.tabs.findIndex(t => t.id === this.activeTab);
    return idx < 0 ? 0 : idx;
  }

  /** The active tab's light background, for the sliding indicator — null lets the default CSS color apply. */
  get activeTabBg(): string | null {
    return this.tabs[this.activeIndex]?.bgColor ?? null;
  }

  // The stylesheet derives the sliding indicator's width and slide distance
  // from these, so the equal-width variant stays correct for any tab count and
  // any label length. Written as strings because they are CSS custom property
  // values, not lengths — Angular passes them straight to setProperty().
  get tabCountVar(): string {
    return String(this.tabs.length);
  }

  get activeIndexVar(): string {
    return String(this.activeIndex);
  }

  select(tab: ProfileTab): void {
    if (!tab.disabled) this.tabChange.emit(tab.id);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const enabled = this.tabs.filter(t => !t.disabled);
    const idx = enabled.findIndex(t => t.id === this.activeTab);
    if (e.key === 'ArrowRight' && idx < enabled.length - 1) {
      this.focusOnNextChange = true;
      this.tabChange.emit(enabled[idx + 1].id);
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      this.focusOnNextChange = true;
      this.tabChange.emit(enabled[idx - 1].id);
    }
  }

  // `activeTab` is parent-controlled, so an arrow-key change only reaches
  // this component on its next input update — without this, the visually
  // active tab and the actually-focused DOM element diverge for keyboard
  // users because focus never follows the emitted selection.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activeTab'] && this.focusOnNextChange) {
      this.focusOnNextChange = false;
      queueMicrotask(() => {
        const idx = this.tabs.findIndex(t => t.id === this.activeTab);
        this.tabButtons?.get(idx)?.nativeElement.focus();
      });
    }
  }
}
