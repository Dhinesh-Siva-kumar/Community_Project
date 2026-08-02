import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-tabs.component.html',
  styleUrls: ['./profile-tabs.component.scss'],
})
export class ProfileTabsComponent {
  @Input() tabs: ProfileTab[] = [];
  @Input() activeTab = '';
  /** Equal-width tabs filling one row, with a sliding active indicator. */
  @Input() fullWidth = false;
  @Output() tabChange = new EventEmitter<string>();

  get activeIndex(): number {
    const idx = this.tabs.findIndex(t => t.id === this.activeTab);
    return idx < 0 ? 0 : idx;
  }

  /** The active tab's light background, for the sliding indicator — null lets the default CSS color apply. */
  get activeTabBg(): string | null {
    return this.tabs[this.activeIndex]?.bgColor ?? null;
  }

  select(tab: ProfileTab): void {
    if (!tab.disabled) this.tabChange.emit(tab.id);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const enabled = this.tabs.filter(t => !t.disabled);
    const idx = enabled.findIndex(t => t.id === this.activeTab);
    if (e.key === 'ArrowRight' && idx < enabled.length - 1) {
      this.tabChange.emit(enabled[idx + 1].id);
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      this.tabChange.emit(enabled[idx - 1].id);
    }
  }
}
