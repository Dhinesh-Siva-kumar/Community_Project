import { Component, OnInit, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentConnectionRequest } from '../../../../core/models';

/** Requests tab (STUDENT_CONNECT_SPEC.md §5.5) — Received / Sent columns.
 * No "demo accepts" affordance — that was an artifact-only stand-in for
 * real-time server state and is explicitly excluded from the real build. */
@Component({
  selector: 'app-student-requests',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.scss'],
})
export class StudentRequestsComponent implements OnInit {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  @Output() connectionAccepted = new EventEmitter<void>();
  @Output() pendingCountChanged = new EventEmitter<number>();

  received = signal<StudentConnectionRequest[]>([]);
  sent = signal<StudentConnectionRequest[]>([]);
  loading = signal(true);
  actioningId = signal<string | null>(null);

  pendingCount = computed(() =>
    this.received().filter((r) => r.status === 'pending').length +
    this.sent().filter((r) => r.status === 'pending').length,
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.studentConnectService.listConnectionRequests().subscribe({
      next: (res) => {
        this.received.set(res.received);
        this.sent.set(res.sent);
        this.loading.set(false);
        this.pendingCountChanged.emit(this.pendingCount());
      },
      error: () => { this.loading.set(false); },
    });
  }

  accept(id: string): void {
    this.actioningId.set(id);
    this.studentConnectService.acceptConnectionRequest(id).subscribe({
      next: () => {
        this.toast.success('user.studentConnect.requests.acceptedToast');
        this.actioningId.set(null);
        this.load();
        this.connectionAccepted.emit();
      },
      error: () => { this.actioningId.set(null); this.toast.error('user.studentConnect.requests.actionFailed'); },
    });
  }

  decline(id: string): void {
    this.actioningId.set(id);
    this.studentConnectService.declineConnectionRequest(id).subscribe({
      next: () => {
        this.toast.info('user.studentConnect.requests.declinedToast');
        this.actioningId.set(null);
        this.load();
      },
      error: () => { this.actioningId.set(null); this.toast.error('user.studentConnect.requests.actionFailed'); },
    });
  }
}
