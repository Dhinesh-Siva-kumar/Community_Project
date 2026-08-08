import {
  Component, OnInit, HostListener, inject, signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, UserFilterParams } from '../../../core/services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, UserListResponse } from '../../../core/models';
import { AddUserDrawerComponent }      from './panels/add-user-drawer/add-user-drawer.component';
import { UserDetailDrawerComponent }   from './panels/user-detail-drawer/user-detail-drawer.component';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';

type ConfirmActionType = 'block' | 'unblock' | 'trust' | 'untrust' | 'delete';

@Component({
  selector: 'app-user-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, DatePipe, FormsModule,
    AddUserDrawerComponent, UserDetailDrawerComponent, SearchableSelectComponent,
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
  pageSize   = signal(10);

  // ── Floating header action (shows once scrolled past the page header) ─────
  showHeaderFab = signal(false);
  private scrollTicking = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.showHeaderFab.set(window.scrollY >= 120);
      this.scrollTicking = false;
    });
  }

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

  // ── Dropdown option lists (app-searchable-select) — same component the
  // rest of the admin console uses, so filters don't fall back to a native
  // OS <select> list that looks out of place next to everything else.
  readonly roleFilterOptions: SelectOption[] = [
    { value: '',      label: 'All Roles' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'USER',  label: 'User' },
  ];
  readonly statusFilterOptions: SelectOption[] = [
    { value: '',        label: 'All Status' },
    { value: 'active',  label: 'Active' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'trusted', label: 'Trusted' },
  ];
  readonly joinedFilterOptions: SelectOption[] = [
    { value: '',     label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: '7d',    label: 'Last 7 Days' },
    { value: '30d',   label: 'Last 30 Days' },
    { value: '90d',   label: 'Last 3 Months' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 10, label: '10' },
    { value: 20, label: '20' },
    { value: 50, label: '50' },
  ];

  // Active filter chips for display
  activeFilterChips = computed<{ key: string; label: string; value: any }[]>(() => {
    const chips: { key: string; label: string; value: any }[] = [];
    if (this.appliedSearch()) chips.push({ key: 'search', label: `"${this.appliedSearch()}"`, value: this.appliedSearch() });
    if (this.filterRole()) chips.push({ key: 'role', label: this.filterRole(), value: this.filterRole() });
    if (this.filterStatus()) chips.push({ key: 'status', label: this.filterStatus()!, value: this.filterStatus() });
    if (this.filterJoined()) chips.push({ key: 'joined', label: `Last ${this.filterJoined()}`, value: this.filterJoined() });
    return chips;
  });

  // ── View mode (table / grid) ────────────────────────────────────────────
  viewMode = signal<'table' | 'grid'>('table');
  setViewMode(mode: 'table' | 'grid'): void { this.viewMode.set(mode); }

  // ── Panel visibility (add-user + detail drawers only) ─────────────────────
  showAddDrawer        = signal(false);
  showDetailDrawer     = signal(false);
  detailUserId         = signal<string | null>(null);

  // ── Row action state ─────────────────────────────────────────────────────
  actionWorkingId = signal<string | null>(null);

  // ── Confirmation popup (block/unblock, trust/untrust, delete) ──────────────
  confirmAction = signal<{ type: ConfirmActionType; user: User } | null>(null);

  // ── Export ────────────────────────────────────────────────────────────────
  exportMenuOpen  = signal(false);
  exporting       = signal(false);

  // ── Dropdown per row ──────────────────────────────────────────────────────
  openDropdownId = signal<string | null>(null);

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

  // ── app-searchable-select handlers (typed value coercion) ──────────────────
  setRoleFilter(v: string | number): void {
    this.filterRole.set(v as 'ADMIN' | 'USER' | '');
    this.onFilterChange();
  }

  setStatusFilter(v: string | number): void {
    this.filterStatus.set(v as 'active' | 'blocked' | 'trusted' | '');
    this.onFilterChange();
  }

  setJoinedFilter(v: string | number): void {
    this.filterJoined.set(v as 'today' | '7d' | '30d' | '90d' | '');
    this.onFilterChange();
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

  removeFilter(filterKey: string): void {
    switch (filterKey) {
      case 'search':
        this.searchInput.set('');
        this.appliedSearch.set('');
        break;
      case 'role':
        this.filterRole.set('');
        break;
      case 'status':
        this.filterStatus.set('');
        break;
      case 'joined':
        this.filterJoined.set('');
        break;
    }
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

  // ── Confirmation popup ───────────────────────────────────────────────────
  requestBlockToggle(user: User): void {
    this.confirmAction.set({ type: user.isBlocked ? 'unblock' : 'block', user });
  }

  requestTrustToggle(user: User): void {
    this.confirmAction.set({ type: user.isTrusted ? 'untrust' : 'trust', user });
  }

  requestDelete(user: User): void {
    this.confirmAction.set({ type: 'delete', user });
  }

  cancelConfirm(): void {
    this.confirmAction.set(null);
  }

  confirmActionExecute(): void {
    const ca = this.confirmAction();
    if (!ca) return;
    this.confirmAction.set(null);
    if (ca.type === 'block' || ca.type === 'unblock') this.toggleBlock(ca.user);
    else if (ca.type === 'trust' || ca.type === 'untrust') this.toggleTrust(ca.user);
    else this.deleteUser(ca.user);
  }

  confirmTitle(type: ConfirmActionType): string {
    const map: Record<ConfirmActionType, string> = {
      block: 'Block User', unblock: 'Unblock User',
      trust: 'Mark as Trusted', untrust: 'Remove Trust',
      delete: 'Delete User',
    };
    return map[type];
  }

  confirmIcon(type: ConfirmActionType): string {
    const map: Record<ConfirmActionType, string> = {
      block: 'bi-lock-fill', unblock: 'bi-unlock-fill',
      trust: 'bi-star-fill', untrust: 'bi-star',
      delete: 'bi-trash3-fill',
    };
    return map[type];
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

  // Two-letter initials for the grid card view (matches Communities page style)
  getGridInitials(user: User): string {
    const name = (user.displayName ?? user.userName ?? '?').trim();
    const parts = name.split(/\s+/).slice(0, 2);
    const initials = parts.map((p) => p.charAt(0).toUpperCase()).join('');
    return initials || '?';
  }

  // Deterministic name-hash gradient — same palette/approach as the
  // Communities list page, so avatars carry the same visual energy.
  private static readonly AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    'linear-gradient(135deg, #1C1917 0%, #44403C 100%)',
    'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
    'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
    'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
    'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
    'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
  ];

  getAvatarGradient(user: User): string {
    const name = user.displayName ?? user.userName ?? '?';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    }
    return UserManagementComponent.AVATAR_GRADIENTS[hash % UserManagementComponent.AVATAR_GRADIENTS.length];
  }

  getStatusLabel(user: User): string {
    if (user.isBlocked) return 'Blocked';
    if (!user.isActive) return 'Inactive';
    return 'Active';
  }

}
