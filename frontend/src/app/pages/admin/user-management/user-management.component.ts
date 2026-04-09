import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { UserService } from '../../../core/services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, PaginatedResponse } from '../../../core/models';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss'],
})
export class UserManagementComponent implements OnInit {
  private userService = inject(UserService);
  private toast = inject(ToastService);

  // Data
  users = signal<User[]>([]);
  loading = signal(true);
  searchTerm = signal('');

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);
  pageSize = signal(10);

  // Action loading
  blockingId = signal<string | null>(null);
  trustingId = signal<string | null>(null);

  // Filtered
  filteredUsers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.users();
    return this.users().filter(
      (u) =>
        u.displayName?.toLowerCase().includes(term) ||
        u.userName?.toLowerCase().includes(term) ||
        (u.email?.toLowerCase().includes(term) ?? false) ||
        (u.location?.toLowerCase().includes(term))
    );
  });

  // Stats
  totalUsersCount = computed(() => this.totalItems());
  activeUsers = computed(() => this.users().filter((u) => u.isActive && !u.isBlocked).length);
  blockedUsers = computed(() => this.users().filter((u) => u.isBlocked).length);
  trustedUsers = computed(() => this.users().filter((u) => u.isTrusted).length);

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize(),
    };

    this.userService.getUsers(params).subscribe({
      next: (response: PaginatedResponse<User>) => {
        this.users.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load users');
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  // Block / Unblock
  toggleBlock(user: User): void {
    this.blockingId.set(user.id);

    const action = user.isBlocked
      ? this.userService.unblockUser(user.id)
      : this.userService.blockUser(user.id);

    action.subscribe({
      next: (updatedUser) => {
        this.users.update((list) =>
          list.map((u) => (u.id === user.id ? { ...u, isBlocked: !user.isBlocked } : u))
        );
        this.toast.success(user.isBlocked ? 'User unblocked' : 'User blocked');
        this.blockingId.set(null);
      },
      error: () => {
        this.toast.error('Action failed');
        this.blockingId.set(null);
      },
    });
  }

  // Trust / Untrust
  toggleTrust(user: User): void {
    this.trustingId.set(user.id);

    const action = user.isTrusted
      ? this.userService.untrustUser(user.id)
      : this.userService.trustUser(user.id);

    action.subscribe({
      next: (updatedUser) => {
        this.users.update((list) =>
          list.map((u) => (u.id === user.id ? { ...u, isTrusted: !user.isTrusted } : u))
        );
        this.toast.success(user.isTrusted ? 'User untrusted' : 'User trusted');
        this.trustingId.set(null);
      },
      error: () => {
        this.toast.error('Action failed');
        this.trustingId.set(null);
      },
    });
  }

  // Pagination
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadUsers();
  }

  getPages(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }
}
