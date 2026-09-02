import { Component, Output, EventEmitter, inject, signal, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, BroadcastPayload } from '../../../../../core/services/user.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { NotificationType } from '../../../../../core/models';
import { RadioGroupComponent, RadioOption } from '../../../../../shared/components/radio-group/radio-group.component';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../../../../shared/directives/scroll-lock.directive';

type RecipientType = 'all' | 'role' | 'user';

@Component({
  selector: 'app-notification-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RadioGroupComponent, TranslatePipe, ScrollLockDirective],
  templateUrl: './notification-modal.component.html',
  styleUrls: ['./notification-modal.component.scss'],
})
export class NotificationModalComponent {
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();

  private userService = inject(UserService);
  private toast       = inject(ToastService);

  recipient    = signal<RecipientType>('all');

  /** "Send To" radio group (app-radio-group, card variant). */
  readonly recipientOptions: RadioOption[] = [
    { value: 'all',  label: 'admin.notificationModal.label.allUsers',     icon: 'bi-people-fill' },
    { value: 'role', label: 'admin.notificationModal.label.byRole',       icon: 'bi-person-gear' },
    { value: 'user', label: 'admin.notificationModal.label.specificUser', icon: 'bi-person-fill' },
  ];
  roleTarget   = signal<'ADMIN' | 'USER'>('USER');
  userId       = signal('');
  notifType    = signal<NotificationType>('COMMUNITY_POST');
  message      = signal('');
  sending      = signal(false);
  sent         = signal(false);
  sentCount    = signal(0);

  readonly typeOptions: { value: NotificationType; label: string }[] = [
    { value: 'COMMUNITY_POST',  label: 'admin.notificationModal.label.communityPost' },
    { value: 'POST_APPROVED',   label: 'admin.notificationModal.label.postApproved'  },
    { value: 'POST_REJECTED',   label: 'admin.notificationModal.label.postRejected'  },
    { value: 'NEW_COMMENT',     label: 'admin.notificationModal.label.newComment'    },
    { value: 'NEW_LIKE',        label: 'admin.notificationModal.label.newLike'       },
    { value: 'USER_BLOCKED',    label: 'admin.notificationModal.label.accountBlocked' },
    { value: 'USER_UNBLOCKED',  label: 'admin.notificationModal.label.accountUnblocked' },
    { value: 'TRUST_GRANTED',   label: 'admin.notificationModal.label.trustGranted'  },
    { value: 'EVENT_CREATED',   label: 'admin.notificationModal.label.eventCreated'  },
    { value: 'JOB_POSTED',      label: 'admin.notificationModal.label.jobPosted'     },
  ];

  msgLength = () => this.message().length;
  canSend   = () => this.message().trim().length > 0 && this.message().length <= 500;

  send(): void {
    if (!this.canSend()) return;
    this.sending.set(true);

    const payload: BroadcastPayload = {
      type:      this.notifType(),
      message:   this.message().trim(),
      recipient: this.recipient(),
      role:      this.recipient() === 'role' ? this.roleTarget() : undefined,
      userId:    this.recipient() === 'user' && this.userId() ? this.userId() : undefined,
    };

    this.userService.broadcastNotification(payload).subscribe({
      next: (res) => {
        this.sentCount.set(res.sent);
        this.sent.set(true);
        this.sending.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Failed to send notification');
        this.sending.set(false);
      },
    });
  }

  reset(): void {
    this.sent.set(false);
    this.message.set('');
    this.sentCount.set(0);
  }
}
