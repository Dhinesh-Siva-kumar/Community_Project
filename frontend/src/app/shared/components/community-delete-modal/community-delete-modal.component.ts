import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommunityService } from '../../../core/services/community.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community } from '../../../core/models';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

/**
 * The single Delete-Community confirmation popup — a straight port of the
 * admin Community page's delete confirmation modal (same red-themed chrome,
 * same copy, same behavior), so the user side gets identical design and
 * functionality. Shared by the user Community list page, the community
 * detail page, and the profile "My Communities" tab.
 */
@Component({
  selector: 'app-community-delete-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ScrollLockDirective],
  templateUrl: './community-delete-modal.component.html',
  styleUrls: ['./community-delete-modal.component.scss'],
})
export class CommunityDeleteModalComponent {
  private svc   = inject(CommunityService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() community: Community | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the deleted community's id after a successful delete. */
  @Output() deleted = new EventEmitter<string>();

  deleting = signal(false);

  requestClose(): void {
    if (this.deleting()) return;
    this.closed.emit();
  }

  confirmDelete(): void {
    const community = this.community;
    if (!community) return;
    this.deleting.set(true);
    this.svc.deleteCommunity(community.id).subscribe({
      next: () => {
        this.toast.success('components.communityDelete.toastDeleted');
        this.deleting.set(false);
        this.deleted.emit(community.id);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error('components.communityDelete.toastFailed');
        this.deleting.set(false);
      },
    });
  }
}
