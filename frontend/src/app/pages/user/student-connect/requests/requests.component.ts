import { Component, OnInit, EventEmitter, Output, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentConnectionRequest } from '../../../../core/models';
import { LanguageService } from '../../../../core/services/language.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { InlineSpinnerComponent } from '../../../../shared/components/inline-spinner/inline-spinner.component';

/** Requests tab (STUDENT_CONNECT_SPEC.md §5.5) — Received / Sent columns.
 * No "demo accepts" affordance — that was an artifact-only stand-in for
 * real-time server state and is explicitly excluded from the real build. */
@Component({
  selector: 'app-student-requests',
  standalone: true,
  imports: [CommonModule, TranslatePipe, InlineSpinnerComponent],
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.scss'],
})
export class StudentRequestsComponent implements OnInit {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);
  language = inject(LanguageService);
  private translationService = inject(TranslationService);

  @Output() connectionAccepted = new EventEmitter<void>();
  @Output() pendingCountChanged = new EventEmitter<number>();

  received = signal<StudentConnectionRequest[]>([]);
  sent = signal<StudentConnectionRequest[]>([]);
  loading = signal(true);
  actioningId = signal<string | null>(null);

  isTranslatingMessages = signal(false);
  private translatedMessages = signal<Map<string, string>>(new Map());

  constructor() {
    effect(() => {
      const version = this.language.languageVersion();
      const isTamil = this.language.isTamil();
      const requests = this.received();
      if (!isTamil || requests.length === 0) {
        this.translatedMessages.set(new Map());
        return;
      }
      const fields: Record<string, string> = {};
      for (const r of requests) {
        if (r.message) fields[r.id] = r.message;
      }
      if (Object.keys(fields).length === 0) return;

      this.isTranslatingMessages.set(true);
      this.translationService.translateFields(fields, 'ta')
        .pipe(finalize(() => this.isTranslatingMessages.set(false)))
        .subscribe((translated) => {
          if (this.language.languageVersion() !== version) return;
          this.translatedMessages.set(new Map(Object.entries(translated)));
        });
    });
  }

  displayMessage(request: StudentConnectionRequest): string | undefined {
    return this.translatedMessages().get(request.id) ?? request.message ?? undefined;
  }

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
