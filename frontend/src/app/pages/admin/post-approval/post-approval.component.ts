import { Component, OnInit, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Post, PaginatedResponse, Country } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';

// Filter chip interface (for active filter display)
export interface FilterChip { key: string; label: string; value: any; }

@Component({
  selector: 'app-post-approval',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, SearchableSelectComponent, SortBarComponent],
  templateUrl: './post-approval.component.html',
  styleUrls: ['./post-approval.component.scss'],
})
export class PostApprovalComponent implements OnInit {
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  // Data
  pendingPosts = signal<Post[]>([]);
  loading = signal(true);

  // Actions
  approvingId = signal<string | null>(null);
  rejectingId = signal<string | null>(null);
  bulkProcessing = signal(false);

  // Selection
  selectedIds = signal<Set<string>>(new Set());
  selectAll = signal(false);

  // Filters
  filterCommunity = signal('');   // general search — matches community name or post content
  filterType = signal('');
  filterCountry  = signal('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  showAdvancedFilters = signal(false);
  private searchDebounce: any = null;

  filterCountryOptions: SelectOption[] = [];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize    = signal(20);
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  // ── Sort — driven by the sort-bar above the grid ────────────
  readonly sortFields: SortField[] = [
    { key: 'joined',    label: 'Submitted' },
    { key: 'community', label: 'Community' },
  ];
  sortBy  = signal<'joined' | 'community'>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as 'joined' | 'community');
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  // Floating header action (shows once scrolled past the page header)
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

  readonly postTypeOptions: SelectOption[] = [
    { value: '', label: 'All Types' },
    { value: 'GENERAL', label: 'General' },
    { value: 'HELP', label: 'Help' },
    { value: 'EMERGENCY', label: 'Emergency Assistance' },
  ];

  // Computed
  pendingCount = computed(() => this.totalItems());

  // Server-side filtering: component list is whatever the API returned.
  filteredPosts = computed(() => this.pendingPosts());

  selectedCount = computed(() => this.selectedIds().size);

  // Statistics by post type (current page only)
  postStats = computed(() => {
    const posts = this.pendingPosts();
    return {
      total: posts.length,
      general: posts.filter(p => p.type === 'GENERAL').length,
      help: posts.filter(p => p.type === 'HELP').length,
      emergency: posts.filter(p => p.type === 'EMERGENCY').length,
    };
  });

  // Active filter chips for display
  activeFilterChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    const add = (key: string, label: string, value: any) => chips.push({ key, label, value });
    if (this.filterCommunity()) add('community', this.filterCommunity(), this.filterCommunity());
    if (this.filterCountry()) add('country', this.filterCountry(), this.filterCountry());
    if (this.filterDateFrom()) add('dateFrom', `From ${this.filterDateFrom()}`, this.filterDateFrom());
    if (this.filterDateTo())   add('dateTo',   `To ${this.filterDateTo()}`, this.filterDateTo());
    if (this.filterType()) {
      const typeLabel = this.postTypeOptions.find(opt => opt.value === this.filterType())?.label ?? this.filterType();
      add('type', typeLabel, this.filterType());
    }
    return chips;
  });

  activeFilterCount = computed(() => this.activeFilterChips().length);

  ngOnInit(): void {
    this.loadPendingPosts();
    this.loadCountries();
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({ value: c.name, label: c.name }));
      },
    });
  }

  loadPendingPosts(): void {
    this.loading.set(true);
    const params = {
      page: this.currentPage(),
      limit: this.pageSize(),
      search: this.filterCommunity() || undefined,
      country: this.filterCountry() || undefined,
      type: (this.filterType() || undefined) as any,
      dateFrom: this.filterDateFrom() || undefined,
      dateTo: this.filterDateTo() || undefined,
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    this.postService.getPendingPosts(params).subscribe({
      next: (response: PaginatedResponse<Post>) => {
        this.pendingPosts.set(response.data);
        this.totalItems.set(response.total);
        this.totalPages.set(response.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load pending posts');
        this.loading.set(false);
      },
    });
  }

  // Selection
  toggleSelectAll(): void {
    const allSelected = this.selectAll();
    if (allSelected) {
      this.selectedIds.set(new Set());
      this.selectAll.set(false);
    } else {
      const allIds = new Set(this.filteredPosts().map((p) => p.id));
      this.selectedIds.set(allIds);
      this.selectAll.set(true);
    }
  }

  toggleSelect(postId: string): void {
    this.selectedIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(postId)) {
        newIds.delete(postId);
      } else {
        newIds.add(postId);
      }
      return newIds;
    });
    // Update selectAll state
    this.selectAll.set(this.selectedIds().size === this.filteredPosts().length);
  }

  isSelected(postId: string): boolean {
    return this.selectedIds().has(postId);
  }

  // ── Reject confirmation (single + bulk) ─────────────────────
  confirmRejectTarget = signal<Post | null>(null);
  confirmRejectBulk = signal(false);

  requestRejectPost(post: Post): void {
    this.confirmRejectTarget.set(post);
  }

  requestRejectSelected(): void {
    if (this.selectedIds().size === 0) return;
    this.confirmRejectBulk.set(true);
  }

  cancelRejectConfirm(): void {
    this.confirmRejectTarget.set(null);
    this.confirmRejectBulk.set(false);
  }

  confirmRejectPostExecute(): void {
    const post = this.confirmRejectTarget();
    if (!post) return;
    this.confirmRejectTarget.set(null);
    this.rejectPost(post.id);
  }

  confirmRejectSelectedExecute(): void {
    this.confirmRejectBulk.set(false);
    this.rejectSelected();
  }

  // Approve / Reject single
  approvePost(id: string): void {
    this.approvingId.set(id);
    this.postService.approvePost(id).subscribe({
      next: () => {
        this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
        this.totalItems.update((v) => Math.max(0, v - 1));
        this.selectedIds.update((ids) => {
          const newIds = new Set(ids);
          newIds.delete(id);
          return newIds;
        });
        this.toast.success('Post approved');
        this.approvingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to approve post');
        this.approvingId.set(null);
      },
    });
  }

  rejectPost(id: string): void {
    this.rejectingId.set(id);
    this.postService.rejectPost(id).subscribe({
      next: () => {
        this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
        this.totalItems.update((v) => Math.max(0, v - 1));
        this.selectedIds.update((ids) => {
          const newIds = new Set(ids);
          newIds.delete(id);
          return newIds;
        });
        this.toast.success('Post rejected');
        this.rejectingId.set(null);
      },
      error: () => {
        this.toast.error('Failed to reject post');
        this.rejectingId.set(null);
      },
    });
  }

  // Bulk actions
  private runBulk(ids: string[], action: (id: string) => Observable<unknown>, verb: 'approved' | 'rejected'): void {
    this.bulkProcessing.set(true);
    let completed = 0;
    let succeeded = 0;
    let failed = 0;

    const finish = () => {
      this.selectedIds.set(new Set());
      this.selectAll.set(false);
      this.bulkProcessing.set(false);
      if (succeeded > 0) this.toast.success(`${succeeded} post${succeeded === 1 ? '' : 's'} ${verb}`);
      if (failed > 0) this.toast.error(`${failed} post${failed === 1 ? '' : 's'} failed to be ${verb}`);
    };

    ids.forEach((id) => {
      action(id).subscribe({
        next: () => {
          this.pendingPosts.update((posts) => posts.filter((p) => p.id !== id));
          this.totalItems.update((v) => Math.max(0, v - 1));
          succeeded++;
          completed++;
          if (completed === ids.length) finish();
        },
        error: () => {
          failed++;
          completed++;
          if (completed === ids.length) finish();
        },
      });
    });
  }

  approveSelected(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    this.runBulk(ids, (id) => this.postService.approvePost(id), 'approved');
  }

  rejectSelected(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    this.runBulk(ids, (id) => this.postService.rejectPost(id), 'rejected');
  }

  // Filters & Search

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update((v) => !v);
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadPendingPosts();
  }

  clearFilters(): void {
    this.filterCommunity.set('');
    this.filterType.set('');
    this.filterCountry.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.selectedIds.set(new Set());
    this.selectAll.set(false);
    this.applyFilters();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'community': this.filterCommunity.set(''); break;
      case 'type':      this.filterType.set('');      break;
      case 'country':   this.filterCountry.set('');   break;
      case 'dateFrom':  this.filterDateFrom.set('');  break;
      case 'dateTo':    this.filterDateTo.set('');    break;
    }
    this.applyFilters();
  }

  // Filters
  onFilterCommunity(event: Event): void {
    this.filterCommunity.set((event.target as HTMLInputElement).value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }

  onFilterType(event: Event): void {
    this.filterType.set((event.target as HTMLSelectElement).value);
    this.applyFilters();
  }

  setCountryFilter(v: string | number): void {
    this.filterCountry.set(v as string);
    this.applyFilters();
  }

  onFilterDateFromChange(e: Event): void {
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onFilterDateToChange(e: Event): void {
    this.filterDateTo.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadPendingPosts();
  }

  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let s = Math.max(1, cur - Math.floor(max / 2));
    const e = Math.min(total, s + max - 1); s = Math.max(1, e - max + 1);
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  }

  // Helpers
  getPostTypeBadge(type: string): { label: string; class: string } {
    switch (type) {
      case 'EMERGENCY':
        return { label: 'Emergency Assistance', class: 'bg-danger' };
      case 'HELP':
        return { label: 'Help', class: 'bg-warning text-dark' };
      default:
        return { label: 'General', class: 'bg-primary' };
    }
  }
}
