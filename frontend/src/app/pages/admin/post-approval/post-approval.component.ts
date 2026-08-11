import { Component, OnInit, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { Post, PaginatedResponse, Country, UserDetail } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';

// Filter chip interface (for active filter display)
export interface FilterChip { key: string; label: string; value: any; }

interface PostGroup { label: string; posts: Post[]; }

// Remembers the last selected view mode (cards/table) across navigations.
const VIEW_STORAGE_KEY = 'admin-post-approval:viewMode';

@Component({
  selector: 'app-post-approval',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, SearchableSelectComponent, SortBarComponent, ImageViewerComponent, ImageUrlPipe],
  templateUrl: './post-approval.component.html',
  styleUrls: ['./post-approval.component.scss'],
})
export class PostApprovalComponent implements OnInit {
  private postService = inject(PostService);
  private authService = inject(AuthService);
  private userService = inject(UserService);
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

  // View mode — card (rich content) vs table (compact scan list)
  viewMode = signal<'cards' | 'table'>('cards');
  setViewMode(mode: 'cards' | 'table'): void {
    this.viewMode.set(mode);
    sessionStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  // Filters
  filterCommunity = signal('');   // general search — matches community name or post content
  filterType = signal('');
  filterCountry  = signal('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  filterAuthorStatus = signal<'' | 'trusted' | 'untrusted'>('');
  showAdvancedFilters = signal(false);
  private searchDebounce: any = null;

  filterCountryOptions: SelectOption[] = [];
  readonly authorStatusOptions: SelectOption[] = [
    { value: '',          label: 'All Authors' },
    { value: 'trusted',   label: 'Trusted' },
    { value: 'untrusted', label: 'Not Trusted' },
  ];
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

  // Pending posts grouped by submission day, for the date-wise view. The
  // list is already ordered by the server (sortBy defaults to 'joined' desc),
  // so grouping here just clusters consecutive posts under a day heading.
  groupedPosts = computed<PostGroup[]>(() => {
    const posts = this.filteredPosts();
    const order: string[] = [];
    const groups = new Map<string, Post[]>();
    for (const post of posts) {
      const label = this.dateGroupLabel(post.createdAt);
      if (!groups.has(label)) { groups.set(label, []); order.push(label); }
      groups.get(label)!.push(post);
    }
    return order.map((label) => ({ label, posts: groups.get(label)! }));
  });

  private dateGroupLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Active filter chips for display
  activeFilterChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    const add = (key: string, label: string, value: any) => chips.push({ key, label, value });
    if (this.filterCommunity()) add('community', this.filterCommunity(), this.filterCommunity());
    if (this.filterCountry()) add('country', this.filterCountry(), this.filterCountry());
    if (this.filterDateFrom()) add('dateFrom', `From ${this.filterDateFrom()}`, this.filterDateFrom());
    if (this.filterDateTo())   add('dateTo',   `To ${this.filterDateTo()}`, this.filterDateTo());
    if (this.filterAuthorStatus()) {
      const label = this.authorStatusOptions.find(opt => opt.value === this.filterAuthorStatus())?.label ?? this.filterAuthorStatus();
      add('authorStatus', label, this.filterAuthorStatus());
    }
    if (this.filterType()) {
      const typeLabel = this.postTypeOptions.find(opt => opt.value === this.filterType())?.label ?? this.filterType();
      add('type', typeLabel, this.filterType());
    }
    return chips;
  });

  activeFilterCount = computed(() => this.activeFilterChips().length);

  ngOnInit(): void {
    this.restoreSavedViewMode();
    this.loadPendingPosts();
    this.loadCountries();
  }

  /** Resume the last selected cards/table view across navigations. */
  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'cards' || saved === 'table') this.viewMode.set(saved);
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
    // Any reload can change which posts are visible (filter/sort/page/refresh),
    // so a stale selection from before the reload must not carry over.
    this.selectedIds.set(new Set());
    this.selectAll.set(false);
    const params = {
      page: this.currentPage(),
      limit: this.pageSize(),
      search: this.filterCommunity() || undefined,
      country: this.filterCountry() || undefined,
      type: (this.filterType() || undefined) as any,
      dateFrom: this.filterDateFrom() || undefined,
      dateTo: this.filterDateTo() || undefined,
      authorStatus: (this.filterAuthorStatus() || undefined) as any,
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

  // ── View post detail popup — full content + attachments ─────
  viewingPost = signal<Post | null>(null);
  viewingAuthor = signal<UserDetail | null>(null);
  viewingAuthorLoading = signal(false);

  viewPost(post: Post): void {
    this.viewingPost.set(post);
    this.viewingAuthor.set(null);
    const userId = post.user?.id;
    if (!userId) return;
    this.viewingAuthorLoading.set(true);
    this.userService.getUserById(userId).subscribe({
      next: (author) => { this.viewingAuthor.set(author); this.viewingAuthorLoading.set(false); },
      error: () => { this.viewingAuthorLoading.set(false); },
    });
  }

  closeViewPost(): void {
    this.viewingPost.set(null);
    this.viewingAuthor.set(null);
  }

  // ─── Image Viewer (lightbox for post attachments) ───────────
  imageViewerOpen = signal(false);
  imageViewerImages = signal<string[]>([]);
  imageViewerInitialIndex = signal(0);

  openImageViewer(images: string[], index: number = 0): void {
    this.imageViewerImages.set(images);
    this.imageViewerInitialIndex.set(index);
    this.imageViewerOpen.set(true);
  }

  closeImageViewer(): void {
    this.imageViewerOpen.set(false);
  }

  // ── Confirmation popup (approve) ─────────────────────────────
  confirmApproveTarget = signal<Post | null>(null);
  confirmApproveBulk = signal(false);

  requestApprove(post: Post): void {
    this.confirmApproveTarget.set(post);
  }

  requestApproveSelected(): void {
    if (this.selectedIds().size === 0) return;
    this.confirmApproveBulk.set(true);
  }

  cancelApproveConfirm(): void {
    this.confirmApproveTarget.set(null);
  }

  cancelApproveSelectedConfirm(): void {
    this.confirmApproveBulk.set(false);
  }

  confirmApproveExecute(): void {
    const post = this.confirmApproveTarget();
    if (!post) return;
    this.confirmApproveTarget.set(null);
    this.approvePost(post.id);
  }

  confirmApproveSelectedExecute(): void {
    this.confirmApproveBulk.set(false);
    this.approveSelected();
  }

  // ── Confirmation popup (reject) ──────────────────────────────
  confirmRejectTarget = signal<Post | null>(null);
  confirmRejectBulk = signal(false);
  rejectReason = signal('');

  requestReject(post: Post): void {
    this.rejectReason.set('');
    this.confirmRejectTarget.set(post);
  }

  requestRejectSelected(): void {
    if (this.selectedIds().size === 0) return;
    this.rejectReason.set('');
    this.confirmRejectBulk.set(true);
  }

  cancelConfirm(): void {
    this.confirmRejectTarget.set(null);
  }

  cancelRejectConfirm(): void {
    this.confirmRejectBulk.set(false);
  }

  confirmRejectExecute(): void {
    const post = this.confirmRejectTarget();
    if (!post) return;
    this.confirmRejectTarget.set(null);
    this.rejectPost(post.id, this.rejectReason());
  }

  confirmRejectSelectedExecute(): void {
    this.confirmRejectBulk.set(false);
    this.rejectSelected(this.rejectReason());
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

  rejectPost(id: string, reason?: string): void {
    this.rejectingId.set(id);
    this.postService.rejectPost(id, reason).subscribe({
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

  rejectSelected(reason?: string): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    this.runBulk(ids, (id) => this.postService.rejectPost(id, reason), 'rejected');
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
    this.filterAuthorStatus.set('');
    this.applyFilters();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'community': this.filterCommunity.set(''); break;
      case 'type':      this.filterType.set('');      break;
      case 'country':   this.filterCountry.set('');   break;
      case 'dateFrom':  this.filterDateFrom.set('');  break;
      case 'dateTo':    this.filterDateTo.set('');    break;
      case 'authorStatus': this.filterAuthorStatus.set(''); break;
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

  setTypeFilter(type: string): void {
    this.filterType.set(type);
    this.applyFilters();
  }

  setCountryFilter(v: string | number): void {
    this.filterCountry.set(v as string);
    this.applyFilters();
  }

  setAuthorStatusFilter(v: string | number): void {
    this.filterAuthorStatus.set(v as '' | 'trusted' | 'untrusted');
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

  showingFrom(): number { return (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }

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
