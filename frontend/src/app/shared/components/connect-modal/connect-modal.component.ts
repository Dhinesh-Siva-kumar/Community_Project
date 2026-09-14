import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../core/services/student-connect.service';
import { ToastService } from '../../../core/services/toast.service';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { AvatarRingComponent } from '../avatar-ring/avatar-ring.component';

/**
 * Send-a-connection-request popup (STUDENT_CONNECT_SPEC.md §5.8) — a
 * pre-filled message the requester can edit before sending.
 */
@Component({
  selector: 'app-connect-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ScrollLockDirective, AvatarRingComponent],
  templateUrl: './connect-modal.component.html',
  styleUrls: ['./connect-modal.component.scss'],
})
export class ConnectModalComponent {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() targetUserId: string | null = null;
  @Input() targetInitial = '';
  @Input() targetName = '';
  @Input() targetCourse = '';
  @Input() targetUniversity = '';
  @Input() targetVerified = false;

  @Output() closed = new EventEmitter<void>();
  @Output() sent = new EventEmitter<void>();

  message = signal('');
  sending = signal(false);

  ngOnChanges(): void {
    if (this.open && this.targetName) {
      this.message.set(
        `Hi ${this.targetName}, I am planning to study ${this.targetCourse} at ${this.targetUniversity}. I would like to know about your student experience.`,
      );
    }
  }

  requestClose(): void {
    if (this.sending()) return;
    this.closed.emit();
  }

  send(): void {
    const text = this.message().trim();
    if (!text || !this.targetUserId) return;

    this.sending.set(true);
    this.studentConnectService.createConnectionRequest(this.targetUserId, text).subscribe({
      next: () => {
        this.toast.success('user.studentConnect.connectModal.toastSent');
        this.sending.set(false);
        this.sent.emit();
        this.closed.emit();
      },
      error: () => {
        this.toast.error('user.studentConnect.connectModal.toastFailed');
        this.sending.set(false);
      },
    });
  }
}
