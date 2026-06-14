import { Component, Output, EventEmitter, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../../../core/services/user.service';
import { AuditLog, AuditLogResponse } from '../../../../../core/models';

const ACTION_COLORS: Record<string, string> = {
  USER_CREATED: '#22c55e', USER_DELETED: '#ef4444', USER_BLOCKED: '#f59e0b',
  USER_UNBLOCKED: '#22c55e', ROLE_CHANGED: '#6366f1', PASSWORD_RESET: '#0ea5e9',
  PROFILE_UPDATE: '#8b5cf6', USER_LOGIN: '#64748b', USER_REGISTER: '#22c55e',
  NOTIFICATION_SENT: '#f97316', TRUST_GRANTED: '#f59e0b', TRUST_REVOKED: '#94a3b8',
};
const ACTION_ICONS: Record<string, string> = {
  USER_CREATED: 'bi-person-plus-fill', USER_DELETED: 'bi-trash-fill',
  USER_BLOCKED: 'bi-lock-fill', USER_UNBLOCKED: 'bi-unlock-fill',
  ROLE_CHANGED: 'bi-person-gear', PASSWORD_RESET: 'bi-key-fill',
  PROFILE_UPDATE: 'bi-pencil-fill', USER_LOGIN: 'bi-box-arrow-in-right',
  USER_REGISTER: 'bi-person-badge-fill', NOTIFICATION_SENT: 'bi-bell-fill',
  TRUST_GRANTED: 'bi-shield-fill-check', TRUST_REVOKED: 'bi-shield-x',
};

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

  getColor(action: string): string { return ACTION_COLORS[action] ?? '#94a3b8'; }
  getIcon(action: string):  string { return ACTION_ICONS[action]  ?? 'bi-activity'; }

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
    return action.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
