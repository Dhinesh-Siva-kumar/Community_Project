import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ProfileTab {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
  disabled?: boolean;
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
  @Output() tabChange = new EventEmitter<string>();

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
