import { Component, Output, EventEmitter, inject, signal, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, BroadcastPayload } from '../../../../../core/services/user.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { NotificationType } from '../../../../../core/models';

type RecipientType = 'all' | 'role' | 'user';

@Component({
  selector: 'app-notification-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notification-modal.component.html',
  styleUrls: ['./notification-modal.component.scss'],
})
export class NotificationModalComponent {
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();

  private userService = inject(UserService);
  private toast       = inject(ToastService);

  recipient    = signal<RecipientType>('all');
  roleTarget   = signal<'ADMIN' | 'USER'>('USER');
  userId       = signal('');
  notifType    = signal<NotificationType>('COMMUNITY_POST');
  message      = signal('');
  sending      = signal(false);
  sent         = signal(false);
  sentCount    = signal(0);

  readonly typeOptions: { value: NotificationType; label: string }[] = [
    { value: 'COMMUNITY_POST',  label: 'Community Post' },
    { value: 'POST_APPROVED',   label: 'Post Approved'  },
    { value: 'POST_REJECTED',   label: 'Post Rejected'  },
    { value: 'NEW_COMMENT',     label: 'New Comment'    },
    { value: 'NEW_LIKE',        label: 'New Like'       },
    { value: 'USER_BLOCKED',    label: 'Account Blocked' },
    { value: 'USER_UNBLOCKED',  label: 'Account Unblocked' },
    { value: 'TRUST_GRANTED',   label: 'Trust Granted'  },
    { value: 'EVENT_CREATED',   label: 'Event Created'  },
    { value: 'JOB_POSTED',      label: 'Job Posted'     },
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
