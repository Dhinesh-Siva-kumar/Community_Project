import { Component, Output, EventEmitter, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../../../core/services/user.service';
import { AuditLog, AuditLogResponse } from '../../../../../core/models';
import { getAuditActionColor, getAuditActionIcon, formatAuditAction } from '../../../../../core/constants/audit-actions';

@Component({
  selector: 'app-activity-log-drawer',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './activity-log-drawer.component.html',
  styleUrls: ['./activity-log-drawer.component.scss'],
})
export class ActivityLogDrawerComponent implements OnInit {
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();

  private userService = inject(UserService);

  logs       = signal<AuditLog[]>([]);
  loading    = signal(true);
  total      = signal(0);
  totalPages = signal(1);
  page       = signal(1);
  actionFilter = signal('');

  readonly actionOptions = [
    '', 'USER_CREATED', 'USER_DELETED', 'USER_BLOCKED', 'USER_UNBLOCKED',
    'ROLE_CHANGED', 'PASSWORD_RESET', 'PROFILE_UPDATE', 'USER_LOGIN',
    'USER_REGISTER', 'NOTIFICATION_SENT',
  ];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.userService.getAuditLogs({
      page: this.page(), limit: 15,
      action: this.actionFilter() || undefined,
    }).subscribe({
      next: (res: AuditLogResponse) => {
        this.logs.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onFilterChange(): void { this.page.set(1); this.load(); }
  goToPage(p: number): void { if (p < 1 || p > this.totalPages()) return; this.page.set(p); this.load(); }

  getColor(action: string): string { return getAuditActionColor(action); }
  getIcon(action: string):  string { return getAuditActionIcon(action); }

  getInitials(log: AuditLog): string {
    return (log.actor?.displayName ?? log.actor?.userName ?? '?').charAt(0).toUpperCase();
  }

  getMetaDesc(log: AuditLog): string {
    if (!log.metadata) return '';
    const m = log.metadata as any;
    if (m.createdUser)  return `Created user: ${m.createdUser}`;
    if (m.deletedUser)  return `Deleted user: ${m.deletedUser}`;
    if (m.targetUser)   return `Target: ${m.targetUser}`;
    if (m.from && m.to) return `Role ${m.from} → ${m.to}`;
    if (m.count)        return `Sent to ${m.count} users`;
    return '';
  }

  formatAction(action: string): string {
    return formatAuditAction(action);
  }
}
