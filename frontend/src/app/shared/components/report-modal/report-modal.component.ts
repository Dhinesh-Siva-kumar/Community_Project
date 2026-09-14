import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../core/services/student-connect.service';
import { ToastService } from '../../../core/services/toast.service';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { StudentReportReason } from '../../../core/models';

interface ReportReasonOption {
  value: StudentReportReason;
  labelKey: string;
}

const REPORT_REASONS: ReportReasonOption[] = [
  { value: 'spam', labelKey: 'user.studentConnect.reportModal.reasons.spam' },
  { value: 'harassment', labelKey: 'user.studentConnect.reportModal.reasons.harassment' },
  { value: 'misleading', labelKey: 'user.studentConnect.reportModal.reasons.misleading' },
  { value: 'fake_profile', labelKey: 'user.studentConnect.reportModal.reasons.fakeProfile' },
  { value: 'other', labelKey: 'user.studentConnect.reportModal.reasons.other' },
];

/** Report-a-profile popup (STUDENT_CONNECT_SPEC.md §5.9). */
@Component({
  selector: 'app-report-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ScrollLockDirective],
  templateUrl: './report-modal.component.html',
  styleUrls: ['./report-modal.component.scss'],
})
export class ReportModalComponent {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() targetUserId: string | null = null;
  @Input() targetName = '';

  @Output() closed = new EventEmitter<void>();
  @Output() reported = new EventEmitter<void>();

  reasons = REPORT_REASONS;
  selectedReason = signal<StudentReportReason | null>(null);
  submitting = signal(false);

  requestClose(): void {
    if (this.submitting()) return;
    this.selectedReason.set(null);
    this.closed.emit();
  }

  selectReason(reason: StudentReportReason): void {
    this.selectedReason.set(reason);
  }

  submit(): void {
    const reason = this.selectedReason();
    if (!reason || !this.targetUserId) return;

    this.submitting.set(true);
    this.studentConnectService.createReport(this.targetUserId, reason).subscribe({
      next: () => {
        this.toast.success('user.studentConnect.reportModal.toastSubmitted');
        this.submitting.set(false);
        this.selectedReason.set(null);
        this.reported.emit();
        this.closed.emit();
      },
      error: () => {
        this.toast.error('user.studentConnect.reportModal.toastFailed');
        this.submitting.set(false);
      },
    });
  }
}
