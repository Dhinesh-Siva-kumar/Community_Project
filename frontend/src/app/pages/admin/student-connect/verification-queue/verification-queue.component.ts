import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentProfile } from '../../../../core/models';

type QueueRow = StudentProfile & { displayName: string; avatar: string | null; universityName: string | null };

/**
 * Admin — Student Verification queue (STUDENT_CONNECT_SPEC.md §5.10). A
 * dedicated page, deliberately not folded into the generic Approval page
 * (its approve/reject/needs-info shape is tuned to posts/community/
 * business/jobs/events sharing one resource shape; student verification is
 * a simpler approve/reject-only flow keyed by userId).
 */
@Component({
  selector: 'app-admin-student-verification-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DatePipe],
  templateUrl: './verification-queue.component.html',
  styleUrls: ['./verification-queue.component.scss'],
})
export class VerificationQueueComponent implements OnInit {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  rows = signal<QueueRow[]>([]);
  loading = signal(true);
  actioningUserId = signal<string | null>(null);
  rejectingUserId = signal<string | null>(null);
  rejectReason = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.studentConnectService.listVerificationQueue(1, 50).subscribe({
      next: (res) => { this.rows.set(res.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  approve(userId: string): void {
    this.actioningUserId.set(userId);
    this.studentConnectService.approveVerification(userId).subscribe({
      next: () => {
        this.toast.success('admin.studentVerification.approvedToast');
        this.actioningUserId.set(null);
        this.load();
      },
      error: () => { this.actioningUserId.set(null); this.toast.error('admin.studentVerification.actionFailed'); },
    });
  }

  startReject(userId: string): void {
    this.rejectingUserId.set(userId);
    this.rejectReason.set('');
  }

  cancelReject(): void {
    this.rejectingUserId.set(null);
  }

  confirmReject(userId: string): void {
    const reason = this.rejectReason().trim();
    if (!reason) return;
    this.actioningUserId.set(userId);
    this.studentConnectService.rejectVerification(userId, reason).subscribe({
      next: () => {
        this.toast.success('admin.studentVerification.rejectedToast');
        this.actioningUserId.set(null);
        this.rejectingUserId.set(null);
        this.load();
      },
      error: () => { this.actioningUserId.set(null); this.toast.error('admin.studentVerification.actionFailed'); },
    });
  }
}
