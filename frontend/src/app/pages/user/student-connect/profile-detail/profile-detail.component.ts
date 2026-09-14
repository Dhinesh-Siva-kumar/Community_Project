import { Component, Input, Output, EventEmitter, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentPublicProfile } from '../../../../core/models';
import { AvatarRingComponent } from '../../../../shared/components/avatar-ring/avatar-ring.component';
import { ConnectModalComponent } from '../../../../shared/components/connect-modal/connect-modal.component';
import { ReportModalComponent } from '../../../../shared/components/report-modal/report-modal.component';

/**
 * Profile detail (STUDENT_CONNECT_SPEC.md §5.3) — a "drill-in" shown by the
 * shell, not a routed view (matches the Jobs page's accordion-style detail
 * pattern: one signal on the parent, not a child route).
 */
@Component({
  selector: 'app-student-profile-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe, AvatarRingComponent, ConnectModalComponent, ReportModalComponent],
  templateUrl: './profile-detail.component.html',
  styleUrls: ['./profile-detail.component.scss'],
})
export class StudentProfileDetailComponent implements OnChanges {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  @Input({ required: true }) userId!: string;

  @Output() back = new EventEmitter<void>();
  @Output() openChat = new EventEmitter<string>();
  @Output() blocked = new EventEmitter<void>();

  chatEnabled = this.studentConnectService.chatEnabled;

  profile = signal<StudentPublicProfile | null>(null);
  loading = signal(true);

  menuOpen = signal(false);
  confirmingBlock = signal(false);
  reportModalOpen = signal(false);
  connectModalOpen = signal(false);

  ngOnChanges(): void {
    if (this.userId) this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.menuOpen.set(false);
    this.confirmingBlock.set(false);
    this.studentConnectService.getProfile(this.userId).subscribe({
      next: (p) => { this.profile.set(p); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('user.studentConnect.profile.loadFailed'); },
    });
  }

  get initial(): string {
    return (this.profile()?.firstName || '?').charAt(0).toUpperCase();
  }

  get courseWithoutDegreePrefix(): string {
    return (this.profile()?.course || '').replace(/^(MSc|BSc|MEng|BA|MA|MBA)\s/, '');
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
    this.confirmingBlock.set(false);
  }

  openReport(): void {
    this.menuOpen.set(false);
    this.reportModalOpen.set(true);
  }

  askConfirmBlock(): void {
    this.confirmingBlock.set(true);
  }

  cancelBlock(): void {
    this.confirmingBlock.set(false);
    this.menuOpen.set(false);
  }

  confirmBlock(): void {
    this.studentConnectService.blockUser(this.userId).subscribe({
      next: () => {
        this.toast.success('user.studentConnect.profile.blockedToast');
        this.menuOpen.set(false);
        this.confirmingBlock.set(false);
        this.blocked.emit();
        this.back.emit();
      },
      error: () => this.toast.error('user.studentConnect.profile.blockFailedToast'),
    });
  }

  openConnect(): void {
    this.connectModalOpen.set(true);
  }

  onConnectSent(): void {
    this.connectModalOpen.set(false);
  }

  onOpenChat(): void {
    this.openChat.emit(this.userId);
  }

  onBack(): void {
    this.back.emit();
  }
}
