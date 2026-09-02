import { Component, Input, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommunityService } from '../../../core/services/community.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community } from '../../../core/models';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

/**
 * Join-Community confirmation popup — shown before a user actually joins,
 * requiring them to tick an agreement checkbox covering both the platform's
 * general community guidelines and the target community's own (optional)
 * rules list. Self-contained like {@link CommunityDeleteModalComponent}:
 * calls the join API itself and emits the result for the host to patch its
 * own local state. Shared by the user Community list page and the
 * community detail page.
 */
@Component({
  selector: 'app-community-join-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ScrollLockDirective],
  templateUrl: './community-join-modal.component.html',
  styleUrls: ['./community-join-modal.component.scss'],
})
export class CommunityJoinModalComponent {
  private svc   = inject(CommunityService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() community: Community | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the joined community's id after a successful join. */
  @Output() joined = new EventEmitter<string>();

  joining = signal(false);
  agreed  = signal(false);

  hasRules = computed(() => (this.community?.rules ?? []).length > 0);

  requestClose(): void {
    if (this.joining()) return;
    this.agreed.set(false);
    this.closed.emit();
  }

  toggleAgreed(): void {
    this.agreed.update((v) => !v);
  }

  confirmJoin(): void {
    const community = this.community;
    if (!community || !this.agreed()) return;
    this.joining.set(true);
    this.svc.joinCommunity(community.id).subscribe({
      next: () => {
        this.toast.success('components.communityJoin.toastJoined');
        this.joining.set(false);
        this.agreed.set(false);
        this.joined.emit(community.id);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'components.communityJoin.toastFailed');
        this.joining.set(false);
      },
    });
  }
}
