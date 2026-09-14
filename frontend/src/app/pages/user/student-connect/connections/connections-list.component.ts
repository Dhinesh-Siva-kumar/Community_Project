import { Component, Input, OnChanges, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentConnection, StudentDirectoryEntry } from '../../../../core/models';

interface Row {
  key: string;
  userId: string;
  firstName: string;
  course: string;
}

/** Shared Connections / Saved list (STUDENT_CONNECT_SPEC.md §5.7) — one
 * component, `mode` input, per the spec's own suggestion. */
@Component({
  selector: 'app-student-connections-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './connections-list.component.html',
  styleUrls: ['./connections-list.component.scss'],
})
export class StudentConnectionsListComponent implements OnChanges {
  private studentConnectService = inject(StudentConnectService);
  private toast = inject(ToastService);

  @Input({ required: true }) mode!: 'connections' | 'saved';
  @Output() viewProfile = new EventEmitter<string>();

  rows = signal<Row[]>([]);
  loading = signal(true);

  ngOnChanges(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    if (this.mode === 'connections') {
      this.studentConnectService.listConnections().subscribe({
        next: (list: StudentConnection[]) => {
          this.rows.set(list.map((c) => ({
            key: c.id, userId: c.otherUserId ?? '', firstName: c.firstName ?? '', course: c.course ?? '',
          })));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.studentConnectService.listSaved().subscribe({
        next: (list: StudentDirectoryEntry[]) => {
          this.rows.set(list.map((p) => ({ key: p.userId, userId: p.userId, firstName: p.firstName, course: p.course })));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  onView(userId: string): void {
    if (userId) this.viewProfile.emit(userId);
  }

  removeSaved(userId: string, event: Event): void {
    event.stopPropagation();
    this.studentConnectService.toggleSaved(userId).subscribe({
      next: () => {
        this.rows.update((list) => list.filter((r) => r.userId !== userId));
      },
      error: () => this.toast.error('user.studentConnect.connections.removeFailed'),
    });
  }
}
