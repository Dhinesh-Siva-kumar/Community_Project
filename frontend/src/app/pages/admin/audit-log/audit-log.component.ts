import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuditService, AuditLogFilterParams, AuditLogActor } from '../../../core/services/audit.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuditLog, AuditLogResponse } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import {
  AUDIT_ACTION_OPTIONS, AUDIT_RESOURCE_OPTIONS,
  formatAuditAction, formatAuditResource, getAuditActionColor, getAuditActionIcon,
} from '../../../core/constants/audit-actions';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe, FormsModule, SearchableSelectComponent],
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss'],
})
export class AuditLogComponent implements OnInit {
  private auditService = inject(AuditService);
  private toast        = inject(ToastService);
  private router        = inject(Router);

  // ── Data ──────────────────────────────────────────────────────────────────
  logs       = signal<AuditLog[]>([]);
  loading    = signal(true);
  total      = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  pageSize   = signal(20);

  // ── Filter state ──────────────────────────────────────────────────────────
  filterAction   = signal('');
  filterResource = signal('');
  filterActorId  = signal('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');

  activeFilterCount = computed(() =>
    [this.filterAction(), this.filterResource(), this.filterActorId(), this.filterDateFrom(), this.filterDateTo()]
      .filter(Boolean).length,
  );

  readonly actionFilterOptions: SelectOption[] = [
    { value: '', label: 'All Actions' },
    ...AUDIT_ACTION_OPTIONS.map((a) => ({ value: a, label: formatAuditAction(a) })),
  ];
  readonly resourceFilterOptions: SelectOption[] = [
    { value: '', label: 'All Resources' },
    ...AUDIT_RESOURCE_OPTIONS.map((r) => ({ value: r, label: formatAuditResource(r) })),
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];

  // Populated from GET /audit-logs/facets — only actors who actually have
  // audit history, rather than every platform user.
  actors = signal<AuditLogActor[]>([]);
  actorFilterOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'All Actors' },
    ...this.actors().map((a) => ({ value: a.id, label: a.displayName || a.userName })),
  ]);

  activeFilterChips = computed<{ key: string; label: string }[]>(() => {
    const chips: { key: string; label: string }[] = [];
    if (this.filterAction())   chips.push({ key: 'action',   label: formatAuditAction(this.filterAction()) });
    if (this.filterResource()) chips.push({ key: 'resource', label: formatAuditResource(this.filterResource()) });
    if (this.filterActorId()) {
      const actor = this.actors().find((a) => a.id === this.filterActorId());
      chips.push({ key: 'actorId', label: `Actor: ${actor?.displayName ?? actor?.userName ?? '…'}` });
    }
    if (this.filterDateFrom()) chips.push({ key: 'dateFrom', label: `From ${this.filterDateFrom()}` });
    if (this.filterDateTo())   chips.push({ key: 'dateTo',   label: `To ${this.filterDateTo()}` });
    return chips;
  });

  exporting = signal(false);

  // ── Detail drawer ─────────────────────────────────────────────────────────
  selectedLog = signal<AuditLog | null>(null);

  ngOnInit(): void {
    this.loadLogs();
    this.loadFacets();
  }

  // ── API ───────────────────────────────────────────────────────────────────
  private buildParams(): AuditLogFilterParams {
    return {
      page:     this.currentPage(),
      limit:    this.pageSize(),
      action:   this.filterAction()   || undefined,
      resource: this.filterResource() || undefined,
      userId:   this.filterActorId()  || undefined,
      dateFrom: this.filterDateFrom() || undefined,
      dateTo:   this.filterDateTo()   || undefined,
    };
  }

  loadLogs(): void {
    this.loading.set(true);
    this.auditService.getAuditLogs(this.buildParams()).subscribe({
      next: (res: AuditLogResponse) => {
        this.logs.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load audit logs');
        this.loading.set(false);
      },
    });
  }

  loadFacets(): void {
    this.auditService.getFacets().subscribe({
      next: (res) => this.actors.set(res.actors),
      error: () => { /* facet dropdowns are a nice-to-have; fail silently */ },
    });
  }

  // ── Filter actions ────────────────────────────────────────────────────────
  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadLogs();
  }

  setActionFilter(v: string | number): void {
    this.filterAction.set(v as string);
    this.onFilterChange();
  }

  setResourceFilter(v: string | number): void {
    this.filterResource.set(v as string);
    this.onFilterChange();
  }

  setActorFilter(v: string | number): void {
    this.filterActorId.set(v as string);
    this.onFilterChange();
  }

  clearFilters(): void {
    this.filterAction.set('');
    this.filterResource.set('');
    this.filterActorId.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.currentPage.set(1);
    this.loadLogs();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'action':   this.filterAction.set('');   break;
      case 'resource': this.filterResource.set(''); break;
      case 'actorId':  this.filterActorId.set('');  break;
      case 'dateFrom': this.filterDateFrom.set(''); break;
      case 'dateTo':   this.filterDateTo.set('');   break;
    }
    this.currentPage.set(1);
    this.loadLogs();
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.currentPage.set(p);
    this.loadLogs();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadLogs();
  }

  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage();
    const max = 5, start = Math.max(1, Math.min(cur - 2, total - max + 1));
    return Array.from({ length: Math.min(max, total) }, (_, i) => start + i);
  }

  showingFrom(): number { return this.total() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.total()); }

  // ── Row helpers ───────────────────────────────────────────────────────────
  getColor(action: string): string { return getAuditActionColor(action); }
  getIcon(action: string):  string { return getAuditActionIcon(action); }
  formatAction(action: string): string { return formatAuditAction(action); }
  formatResource(resource: string | null): string { return resource ? formatAuditResource(resource) : ''; }

  getInitials(log: AuditLog): string {
    return (log.actor?.displayName ?? log.actor?.userName ?? '?').charAt(0).toUpperCase();
  }

  getMetaDesc(log: AuditLog): string {
    if (!log.metadata) return '';
    const m = log.metadata as Record<string, unknown>;
    if (m['createdUser'])  return `Created user: ${m['createdUser']}`;
    if (m['deletedUser'])  return `Deleted user: ${m['deletedUser']}`;
    if (m['targetUser'])   return `Target: ${m['targetUser']}`;
    if (m['from'] && m['to']) return `Role ${m['from']} → ${m['to']}`;
    if (m['count'])        return `Sent to ${m['count']} users`;
    if (m['name'])         return `${m['name']}`;
    if (m['title'])        return `${m['title']}`;
    if (m['fields'])       return `Fields: ${(m['fields'] as string[]).join(', ')}`;
    if (m['byAdmin'])      return 'Performed by admin';
    if (m['adminPanel'])   return 'Admin panel sign-in';
    if (m['selfService'])  return 'Self-service';
    if (m['google'])       return 'Via Google sign-in';
    return '';
  }

  // ── Detail drawer ─────────────────────────────────────────────────────────
  openDetail(log: AuditLog): void { this.selectedLog.set(log); }
  closeDetail(): void { this.selectedLog.set(null); }

  metadataEntries(log: AuditLog | null): { key: string; value: string }[] {
    if (!log?.metadata) return [];
    return Object.entries(log.metadata).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(', ') : String(value),
    }));
  }

  /** Best-effort browser/OS summary from a raw user-agent string. */
  describeUserAgent(ua: string | null): string {
    if (!ua) return 'Unknown device';
    const os =
      /Windows/.test(ua) ? 'Windows' :
      /Mac OS/.test(ua) ? 'macOS' :
      /Android/.test(ua) ? 'Android' :
      /iPhone|iPad/.test(ua) ? 'iOS' :
      /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
    const browser =
      /Edg\//.test(ua) ? 'Edge' :
      /Chrome\//.test(ua) ? 'Chrome' :
      /Firefox\//.test(ua) ? 'Firefox' :
      /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
    return `${browser} on ${os}`;
  }

  /** Where "View Record" should navigate for a given log, if a target page exists. */
  getResourceLink(log: AuditLog): string[] | null {
    if (!log.resourceId) return null;
    if (log.resource === 'communities') return ['/admin/community', log.resourceId];
    if (log.resource === 'users') return ['/admin/user-management'];
    return null;
  }

  getResourceLinkQueryParams(log: AuditLog): Record<string, string> | undefined {
    if (log.resource === 'users' && log.resourceId) return { userId: log.resourceId };
    return undefined;
  }

  viewResource(log: AuditLog): void {
    if (log.resource === 'posts' && log.metadata?.['communityId']) {
      this.router.navigate(['/admin/community', log.metadata['communityId'] as string], {
        fragment: `post-${log.resourceId}`,
      });
      return;
    }
    const link = this.getResourceLink(log);
    if (!link) return;
    this.router.navigate(link, { queryParams: this.getResourceLinkQueryParams(log) });
  }

  hasResourceLink(log: AuditLog): boolean {
    return !!this.getResourceLink(log) || (log.resource === 'posts' && !!log.metadata?.['communityId']);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  private readonly exportHeaders = ['Time', 'Action', 'Actor', 'Resource', 'Resource ID', 'Details', 'IP Address'];

  private buildExportRows(logs: AuditLog[]): (string | number)[][] {
    return logs.map((l) => [
      l.createdAt, formatAuditAction(l.action),
      l.actor?.displayName ?? l.actor?.userName ?? 'System',
      l.resource ?? '', l.resourceId ?? '', this.getMetaDesc(l), l.ipAddress ?? '',
    ]);
  }

  exportCSV(): void {
    this.exporting.set(true);
    this.auditService.exportAllLogs(this.buildParams()).subscribe({
      next: (logs) => {
        const rows = this.buildExportRows(logs);
        const csv = [this.exportHeaders, ...rows]
          .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
          .join('\n');
        this.downloadFile(csv, 'audit-log.csv', 'text/csv');
        this.toast.success(`Exported ${logs.length} log${logs.length === 1 ? '' : 's'} to CSV`);
        this.exporting.set(false);
      },
      error: () => { this.toast.error('Export failed'); this.exporting.set(false); },
    });
  }

  private downloadFile(content: string, filename: string, type: string): void {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}
