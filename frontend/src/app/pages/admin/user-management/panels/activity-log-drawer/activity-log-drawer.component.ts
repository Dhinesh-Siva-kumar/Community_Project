import { Component, Output, EventEmitter, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../../../core/services/user.service';
import { AuditLog, AuditLogResponse } from '../../../../../core/models';
import { getAuditActionColor, getAuditActionIcon, auditActionKey, titleCaseCode } from '../../../../../core/constants/audit-actions';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-activity-log-drawer',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, TranslatePipe],
  templateUrl: './activity-log-drawer.component.html',
  styleUrls: ['./activity-log-drawer.component.scss'],
})
export class ActivityLogDrawerComponent implements OnInit {
  private translate = inject(TranslateService);
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
    if (m.createdUser)  return this.translate.instant('audit.meta.createdUser', { name: m.createdUser });
    if (m.deletedUser)  return this.translate.instant('audit.meta.deletedUser', { name: m.deletedUser });
    if (m.targetUser)   return `Target: ${m.targetUser}`;
    if (m.from && m.to) return this.translate.instant('audit.meta.roleChange', { from: m.from, to: m.to });
    if (m.count)        return this.translate.instant('audit.meta.sentToUsers', { count: m.count });
    return '';
  }

  formatAction(action: string): string {
    const key = auditActionKey(action);
    const text = this.translate.instant(key);
    return text === key ? titleCaseCode(action) : (text as string);
  }
}
