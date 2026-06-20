import {
  Component, OnInit, inject, signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { UserService, UserFilterParams } from '../../../core/services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, UserListResponse } from '../../../core/models';
import { AddUserDrawerComponent }      from './panels/add-user-drawer/add-user-drawer.component';
import { UserDetailDrawerComponent }   from './panels/user-detail-drawer/user-detail-drawer.component';
import { ActivityLogDrawerComponent }  from './panels/activity-log-drawer/activity-log-drawer.component';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';

type BulkAction = 'block' | 'unblock' | 'delete' | 'role';
type PageTab = 'users' | 'activity' | 'reports';

@Component({
  selector: 'app-user-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, DatePipe, FormsModule,
    AddUserDrawerComponent, UserDetailDrawerComponent, ActivityLogDrawerComponent,
    ProfileTabsComponent,
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss'],
})
export class UserManagementComponent implements OnInit {
  private userService = inject(UserService);
  private toast       = inject(ToastService);

  // ── Data ──────────────────────────────────────────────────────────────────
  users      = signal<User[]>([]);
  loading    = signal(true);
  stats      = signal({ total: 0, active: 0, blocked: 0, trusted: 0, adminCount: 0 });
  total      = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  pageSize   = signal(20);

  // ── Filter state ──────────────────────────────────────────────────────────
  searchInput  = signal('');      // live-bound to input
  appliedSearch = signal('');     // only updates on Search btn / Enter
  filterRole   = signal<'ADMIN' | 'USER' | ''>('');
  filterStatus = signal<'active' | 'blocked' | 'trusted' | ''>('');
  filterJoined = signal<'today' | '7d' | '30d' | '90d' | ''>('');

  activeFilterCount = computed(() =>
    [this.appliedSearch(), this.filterRole(), this.filterStatus(), this.filterJoined()]
      .filter(Boolean).length,
  );

  // ── Selection / bulk ──────────────────────────────────────────────────────
  selectedIds    = signal<Set<string>>(new Set());
  bulkRoleTarget = signal<'ADMIN' | 'USER'>('USER');
  confirmBulk    = signal<BulkAction | null>(null);
  bulkWorking    = signal(false);

  selectedCount = computed(() => this.selectedIds().size);
  allSelected   = computed(() =>
    this.users().length > 0 && this.users().every((u) => this.selectedIds().has(u.id)),
  );

  // ── Page tabs ─────────────────────────────────────────────────────────────
  activeTab = signal<PageTab>('users');

  pageTabs: ProfileTab[] = [
    { id: 'users',    label: 'Users',        icon: 'bi-people-fill' },
    { id: 'activity', label: 'Activity Log', icon: 'bi-clock-history' },
    { id: 'reports',  label: 'Reports',      icon: 'bi-flag-fill' },
  ];

  setPageTab(id: string): void {
    this.activeTab.set(id as PageTab);
  }

  // ── Panel visibility (add-user + detail drawers only) ─────────────────────
  showAddDrawer        = signal(false);
  showDetailDrawer     = signal(false);
  detailUserId         = signal<string | null>(null);

  // ── Row action state ─────────────────────────────────────────────────────
  actionWorkingId = signal<string | null>(null);

  // ── Export ────────────────────────────────────────────────────────────────
  exportMenuOpen  = signal(false);
  exporting       = signal(false);

  // ── Dropdown per row ──────────────────────────────────────────────────────
  openDropdownId = signal<string | null>(null);

  // ── Computed subtitle ─────────────────────────────────────────────────────
  subtitle = computed(() => {
    const parts: string[] = [];
    if (this.filterStatus() === 'blocked') parts.push('blocked');
    if (this.filterStatus() === 'active')  parts.push('active');
    if (this.filterStatus() === 'trusted') parts.push('trusted');
    if (this.filterRole())                 parts.push(this.filterRole()!.toLowerCase());
    const qualifier = parts.join(' ');
    const count = this.total();
    if (this.appliedSearch()) return `${count} result${count === 1 ? '' : 's'} for "${this.appliedSearch()}"`;
    if (qualifier) return `Showing ${count} ${qualifier} user${count === 1 ? '' : 's'}`;
    return `${count} total user${count === 1 ? '' : 's'} on the platform`;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  // ── API ───────────────────────────────────────────────────────────────────
  loadUsers(): void {
    this.loading.set(true);
    const params: UserFilterParams = {
      page:   this.currentPage(),
      limit:  this.pageSize(),
      search: this.appliedSearch() || undefined,
      role:   this.filterRole()   || undefined,
      status: this.filterStatus() || undefined,
      joined: this.filterJoined() || undefined,
    };
    this.userService.getUsers(params).subscribe({
      next: (res: UserListResponse) => {
        this.users.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.stats.set(res.stats);
        this.loading.set(false);
        this.selectedIds.set(new Set());
      },
      error: () => {
        this.toast.error('Failed to load users');
        this.loading.set(false);
      },
    });
  }

  // ── Filter actions ────────────────────────────────────────────────────────
  applyFilters(): void {
    this.appliedSearch.set(this.searchInput());
    this.currentPage.set(1);
    this.loadUsers();
  }

  onSearchKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.applyFilters();
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadUsers();
  }

  clearFilters(): void {
    this.searchInput.set('');
    this.appliedSearch.set('');
    this.filterRole.set('');
    this.filterStatus.set('');
    this.filterJoined.set('');
    this.currentPage.set(1);
    this.loadUsers();
  }

  setStatFilter(status: 'active' | 'blocked' | 'trusted' | ''): void {
    const current = this.filterStatus();
    this.filterStatus.set(current === status ? '' : status);
    this.onFilterChange();
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.currentPage.set(p);
    this.loadUsers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadUsers();
  }

  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage();
    const max = 5, start = Math.max(1, Math.min(cur - 2, total - max + 1));
    return Array.from({ length: Math.min(max, total) }, (_, i) => start + i);
  }

  showingFrom(): number { return (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.total()); }

  // ── Row selection ──────────────────────────────────────────────────────────
  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.users().map((u) => u.id)));
    }
  }

  toggleSelect(id: string): void {
    const s = new Set(this.selectedIds());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selectedIds.set(s);
  }

  isSelected(id: string): boolean { return this.selectedIds().has(id); }
  clearSelection(): void          { this.selectedIds.set(new Set()); }

  // ── Single-row actions ─────────────────────────────────────────────────────
  toggleRowDropdown(id: string, e: Event): void {
    e.stopPropagation();
    this.openDropdownId.set(this.openDropdownId() === id ? null : id);
  }

  closeDropdowns(): void { this.openDropdownId.set(null); }

  viewUser(id: string): void {
    this.detailUserId.set(id);
    this.showDetailDrawer.set(true);
    this.closeDropdowns();
  }

  editUser(id: string): void {
    this.detailUserId.set(id);
    this.showDetailDrawer.set(true);
    this.closeDropdowns();
  }

  toggleBlock(user: User): void {
    this.actionWorkingId.set(user.id);
    const obs = user.isBlocked
      ? this.userService.unblockUser(user.id)
      : this.userService.blockUser(user.id);
    obs.subscribe({
      next: () => {
        this.users.update((list) =>
          list.map((u) => u.id === user.id ? { ...u, isBlocked: !user.isBlocked } : u),
        );
        this.toast.success(user.isBlocked ? 'User unblocked' : 'User blocked');
        this.actionWorkingId.set(null);
        this.closeDropdowns();
      },
      error: () => { this.toast.error('Action failed'); this.actionWorkingId.set(null); },
    });
  }

  toggleTrust(user: User): void {
    this.actionWorkingId.set(user.id);
    const obs = user.isTrusted
      ? this.userService.untrustUser(user.id)
      : this.userService.trustUser(user.id);
    obs.subscribe({
      next: () => {
        this.users.update((list) =>
          list.map((u) => u.id === user.id ? { ...u, isTrusted: !user.isTrusted } : u),
        );
        this.toast.success(user.isTrusted ? 'Trust removed' : 'User trusted');
        this.actionWorkingId.set(null);
        this.closeDropdowns();
      },
      error: () => { this.toast.error('Action failed'); this.actionWorkingId.set(null); },
    });
  }

  deleteUser(user: User): void {
    if (!confirm(`Delete "${user.displayName}"? This will deactivate their account.`)) return;
    this.actionWorkingId.set(user.id);
    this.userService.softDeleteUser(user.id).subscribe({
      next: () => {
        this.users.update((list) => list.filter((u) => u.id !== user.id));
        this.total.update((t) => t - 1);
        this.toast.success('User deactivated');
        this.actionWorkingId.set(null);
        this.closeDropdowns();
      },
      error: () => { this.toast.error('Failed to delete user'); this.actionWorkingId.set(null); },
    });
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────
  initBulkAction(action: BulkAction): void {
    this.confirmBulk.set(action);
  }

  cancelBulk(): void { this.confirmBulk.set(null); }

  executeBulkAction(): void {
    const action = this.confirmBulk();
    const ids = Array.from(this.selectedIds());
    if (!action || ids.length === 0) return;

    this.bulkWorking.set(true);
    const calls: Observable<unknown>[] = ids.map((id) => {
      if (action === 'block')   return this.userService.blockUser(id);
      if (action === 'unblock') return this.userService.unblockUser(id);
      if (action === 'delete')  return this.userService.softDeleteUser(id);
      if (action === 'role')    return this.userService.changeUserRole(id, this.bulkRoleTarget());
      return this.userService.blockUser(id);
    });

    let done = 0;
    calls.forEach((obs) => obs.subscribe({
      next: () => {
        done++;
        if (done === calls.length) {
          this.toast.success(`${action} applied to ${ids.length} user${ids.length > 1 ? 's' : ''}`);
          this.confirmBulk.set(null);
          this.bulkWorking.set(false);
          this.loadUsers();
        }
      },
      error: () => {
        done++;
        if (done === calls.length) {
          this.toast.error('Some actions failed');
          this.confirmBulk.set(null);
          this.bulkWorking.set(false);
          this.loadUsers();
        }
      },
    }));
  }

  // ── Panel handlers ────────────────────────────────────────────────────────
  onUserCreated(): void {
    this.showAddDrawer.set(false);
    this.loadUsers();
    this.toast.success('User created successfully');
  }

  onUserUpdated(updated: User): void {
    this.users.update((list) => list.map((u) => u.id === updated.id ? updated : u));
  }

  // ── Export ────────────────────────────────────────────────────────────────
  toggleExportMenu(e: Event): void {
    e.stopPropagation();
    this.exportMenuOpen.update((v) => !v);
  }

  exportCSV(): void {
    this.exportMenuOpen.set(false);
    this.exporting.set(true);
    this.userService.exportUsers({
      search: this.appliedSearch() || undefined,
      role:   this.filterRole()   || undefined,
      status: this.filterStatus() || undefined,
    }).subscribe({
      next: (res) => {
        const headers = ['ID', 'Display Name', 'Username', 'Email', 'Phone', 'Role', 'Status', 'Trusted', 'Country', 'Joined'];
        const rows = res.data.map((u) => [
          u.id, u.displayName, u.userName, u.email ?? '', u.phoneNo ?? '',
          u.role, u.isBlocked ? 'Blocked' : u.isActive ? 'Active' : 'Inactive',
          u.isTrusted ? 'Yes' : 'No', u.country, u.createdAt,
        ]);
        const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        this.downloadFile(csv, 'users.csv', 'text/csv');
        this.exporting.set(false);
      },
      error: () => { this.toast.error('Export failed'); this.exporting.set(false); },
    });
  }

  exportJSON(): void {
    this.exportMenuOpen.set(false);
    this.exporting.set(true);
    this.userService.exportUsers().subscribe({
      next: (res) => {
        this.downloadFile(JSON.stringify(res.data, null, 2), 'users.json', 'application/json');
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  getInitials(user: User): string {
    return (user.displayName ?? user.userName ?? '?').charAt(0).toUpperCase();
  }

  getStatusLabel(user: User): string {
    if (user.isBlocked) return 'Blocked';
    if (!user.isActive) return 'Inactive';
    return 'Active';
  }

  bulkActionLabel(a: BulkAction | null): string {
    const map: Record<BulkAction, string> = {
      block: 'Block', unblock: 'Unblock', delete: 'Delete', role: 'Change Role',
    };
    return a ? map[a] : '';
  }
}
