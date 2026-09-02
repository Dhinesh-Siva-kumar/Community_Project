import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommunityService } from '../../../core/services/community.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community } from '../../../core/models';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

/**
 * Leave-Community confirmation popup — a straight port of
 * {@link CommunityDeleteModalComponent}'s chrome (self-contained: calls the
 * leave API itself and emits the result for the host to patch its own local
 * state), re-themed amber/warning instead of red since leaving isn't
 * destructive. Shared by the user Community list page and the community
 * detail page.
 */
@Component({
  selector: 'app-community-leave-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ScrollLockDirective],
  templateUrl: './community-leave-modal.component.html',
  styleUrls: ['./community-leave-modal.component.scss'],
})
export class CommunityLeaveModalComponent {
  private svc   = inject(CommunityService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() community: Community | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the left community's id after a successful leave. */
  @Output() left = new EventEmitter<string>();

  leaving = signal(false);

  requestClose(): void {
    if (this.leaving()) return;
    this.closed.emit();
  }

  confirmLeave(): void {
    const community = this.community;
    if (!community) return;
    this.leaving.set(true);
    this.svc.leaveCommunity(community.id).subscribe({
      next: () => {
        this.toast.success('components.communityLeave.toastLeft');
        this.leaving.set(false);
        this.left.emit(community.id);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'components.communityLeave.toastFailed');
        this.leaving.set(false);
      },
    });
  }
}
