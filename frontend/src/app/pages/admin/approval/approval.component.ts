import { Component, OnInit, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, forkJoin, EMPTY } from 'rxjs';
import { CommunityService, PendingCommunitiesQueryParams } from '../../../core/services/community.service';
import { BusinessService, PendingBusinessQueryParams } from '../../../core/services/business.service';
import { JobService, PendingJobsQueryParams } from '../../../core/services/job.service';
import { EventService, PendingEventsQueryParams } from '../../../core/services/event.service';
import { PostService } from '../../../core/services/post.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Country, PaginatedResponse } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { PendingPostsQueryParams } from '../../../core/services/post.service';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

export type EntityKey = 'posts' | 'community' | 'business' | 'jobs' | 'events';

export interface PendingItem {
  id: string;
  [key: string]: any;
}

interface EntityTab {
  id: EntityKey;
  label: string;
  singular: string;
  icon: string;
}

// 'posts' shares the exact same generic table/filters/actions as the other
// four tabs — no separate card/grid view, no separate stats cards.
const ENTITY_TABS: EntityTab[] = [
  { id: 'posts',      label: 'admin.approval.label.posts',      singular: 'admin.approval.label.post',      icon: 'bi-file-earmark-text' },
  { id: 'community',  label: 'admin.approval.label.community',  singular: 'admin.approval.label.community', icon: 'bi-people' },
  { id: 'business',   label: 'admin.approval.label.business',   singular: 'admin.approval.label.business',  icon: 'bi-shop' },
  { id: 'jobs',        label: 'admin.approval.label.jobs',       singular: 'admin.approval.label.job',       icon: 'bi-briefcase' },
  { id: 'events',      label: 'admin.approval.label.events',     singular: 'admin.approval.label.event',     icon: 'bi-calendar-event' },
];

@Component({
  selector: 'app-approval',
  standalone: true,
  imports: [DateInputComponent, CommonModule, DatePipe, FormsModule, SearchableSelectComponent, ImageUrlPipe, ImageErrorHandlerDirective, ScrollLockDirective, TranslatePipe],
  templateUrl: './approval.component.html',
  styleUrls: ['./approval.component.scss'],
})
export class ApprovalComponent implements OnInit {
  private communityService = inject(CommunityService);
  private businessService  = inject(BusinessService);
  private jobService        = inject(JobService);
  private eventService      = inject(EventService);
  private postService       = inject(PostService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private translate         = inject(TranslateService);
  private route              = inject(ActivatedRoute);

  readonly entityTabs = ENTITY_TABS;
  activeEntity = signal<EntityKey>('posts');

  pendingCounts = signal<Record<EntityKey, number>>({ posts: 0, community: 0, business: 0, jobs: 0, events: 0 });

  // Data
  items   = signal<PendingItem[]>([]);
  loading = signal(true);

  // Filters
  filterSearch   = signal('');
  filterCountry  = signal('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  filterCountryOptions: SelectOption[] = [];
  private searchDebounce: any = null;

  // Community-only filters — Visibility and Default are meaningless for the
  // other four entity tabs, so the controls only render (and only get sent
  // to the API) while activeEntity() === 'community'.
  filterVisibility = signal<'global' | 'private' | ''>('');
  filterIsDefault  = signal<'true' | 'false' | ''>('');
  readonly visibilityFilterOptions: SelectOption[] = [
    { value: '',        label: 'admin.approval.allVisibility' },
    { value: 'global',  label: 'admin.approval.global' },
    { value: 'private', label: 'admin.approval.private' },
  ];
  readonly defaultFilterOptions: SelectOption[] = [
    { value: '',      label: 'admin.approval.allDefault' },
    { value: 'true',  label: 'admin.approval.defaultOnly' },
    { value: 'false', label: 'admin.approval.nonDefault' },
  ];

  hasActiveFilters = computed(() =>
    !!(this.filterSearch() || this.filterCountry() || this.filterDateFrom() || this.filterDateTo()
      || this.filterVisibility() || this.filterIsDefault())
  );

  // Pagination
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize    = signal(20);
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  showingFrom = computed(() => this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1);
  showingTo   = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalItems()));

  // Sort — clickable column headers, same interaction as the Community admin table.
  // Every column is sortable except Actions: 'name' = Item, 'submitter' = Submitted By,
  // 'meta' = Country/Community, 'joined' = Submitted.
  sortBy  = signal<'joined' | 'name' | 'submitter' | 'meta'>('joined');
  sortDir = signal<'asc' | 'desc'>('desc');

  // Selection
  selectedIds   = signal<Set<string>>(new Set());
  selectAll     = signal(false);
  selectedCount = computed(() => this.selectedIds().size);

  // Action state
  approvingId     = signal<string | null>(null);
  rejectingId     = signal<string | null>(null);
  requestingInfoId = signal<string | null>(null);
  bulkProcessing  = signal(false);

  confirmApproveTarget = signal<PendingItem | null>(null);
  confirmRejectTarget  = signal<PendingItem | null>(null);
  confirmMoreInfoTarget = signal<PendingItem | null>(null);
  confirmBulkApprove   = signal(false);
  confirmBulkReject    = signal(false);
  confirmBulkMoreInfo   = signal(false);
  rejectReason          = signal('');
  moreInfoReason         = signal('');

  viewingItem    = signal<PendingItem | null>(null);
  lightboxOpen   = signal(false);
  lightboxImages = signal<string[]>([]);
  activeImageIndex = signal(0);

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

  ngOnInit(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab') as EntityKey | null;
    if (requestedTab && this.entityTabs.some(t => t.id === requestedTab)) {
      this.activeEntity.set(requestedTab);
    }
    this.loadCountries();
    this.loadPending();
    this.loadAllPendingCounts();
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res: any) => { this.filterCountryOptions = res.data.map((c: Country) => ({ value: c.name, label: c.name })); },
      error: () => {},
    });
  }

  // ── Entity tab switching ────────────────────────────────────
  switchEntity(key: EntityKey): void {
    if (this.activeEntity() === key) return;
    this.activeEntity.set(key);
    this.currentPage.set(1);
    this.filterSearch.set('');
    this.filterCountry.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterVisibility.set('');
    this.filterIsDefault.set('');
    this.sortBy.set('joined');
    this.sortDir.set('desc');
    this.loadPending();
  }

  currentTab(): EntityTab {
    return this.entityTabs.find(t => t.id === this.activeEntity())!;
  }

  /** Translated entity nouns for toast interpolation. The tab's `label`/`singular`
   * are catalog keys, so they must be resolved before being placed inside a
   * sentence — otherwise the raw key leaks into the toast. */
  private tabLabel(): string { return (this.translate.instant(this.currentTab().label) as string).toLowerCase(); }
  private tabSingular(): string { return this.translate.instant(this.currentTab().singular) as string; }

  // ── Per-entity service dispatch ─────────────────────────────
  private fetchPending(params: Record<string, any>): Observable<PaginatedResponse<PendingItem>> {
    switch (this.activeEntity()) {
      case 'posts':      return this.postService.getPendingPosts(params as PendingPostsQueryParams) as Observable<PaginatedResponse<PendingItem>>;
      case 'community':  return this.communityService.getPendingCommunities(params as PendingCommunitiesQueryParams) as Observable<PaginatedResponse<PendingItem>>;
      case 'business':   return this.businessService.getPendingBusinesses(params as PendingBusinessQueryParams) as Observable<PaginatedResponse<PendingItem>>;
      case 'jobs':        return this.jobService.getPendingJobs(params as PendingJobsQueryParams) as Observable<PaginatedResponse<PendingItem>>;
      case 'events':      return this.eventService.getPendingEvents(params as PendingEventsQueryParams) as Observable<PaginatedResponse<PendingItem>>;
    }
  }

  private approveItem(id: string): Observable<any> {
    switch (this.activeEntity()) {
      case 'posts':      return this.postService.approvePost(id);
      case 'community':  return this.communityService.approveCommunity(id);
      case 'business':   return this.businessService.approveBusiness(id);
      case 'jobs':        return this.jobService.approveJob(id);
      case 'events':      return this.eventService.approveEvent(id);
    }
  }

  private rejectItem(id: string, reason?: string): Observable<any> {
    switch (this.activeEntity()) {
      case 'posts':      return this.postService.rejectPost(id, reason);
      case 'community':  return this.communityService.rejectCommunity(id, reason);
      case 'business':   return this.businessService.rejectBusiness(id, reason);
      case 'jobs':        return this.jobService.rejectJob(id, reason);
      case 'events':      return this.eventService.rejectEvent(id, reason);
    }
  }

  private requestMoreInfoItem(id: string, reason: string): Observable<any> {
    switch (this.activeEntity()) {
      case 'posts':      return this.postService.requestMoreInfoPost(id, reason);
      case 'community':  return this.communityService.requestMoreInfoCommunity(id, reason);
      case 'business':   return this.businessService.requestMoreInfoBusiness(id, reason);
      case 'jobs':        return this.jobService.requestMoreInfoJob(id, reason);
      case 'events':      return this.eventService.requestMoreInfoEvent(id, reason);
    }
  }

  private countObservable(key: EntityKey): Observable<{ count: number }> {
    switch (key) {
      case 'posts':      return this.postService.getPendingCount();
      case 'community':  return this.communityService.getPendingCommunitiesCount();
      case 'business':   return this.businessService.getPendingBusinessesCount();
      case 'jobs':        return this.jobService.getPendingJobsCount();
      case 'events':      return this.eventService.getPendingEventsCount();
    }
  }

  loadAllPendingCounts(): void {
    forkJoin({
      posts:     this.countObservable('posts'),
      community: this.countObservable('community'),
      business:  this.countObservable('business'),
      jobs:       this.countObservable('jobs'),
      events:     this.countObservable('events'),
    }).subscribe({
      next: (res) => this.pendingCounts.set({
        posts: res.posts.count, community: res.community.count, business: res.business.count,
        jobs: res.jobs.count, events: res.events.count,
      }),
      error: () => {},
    });
  }

  private refreshCountForActiveEntity(): void {
    const key = this.activeEntity();
    this.countObservable(key).subscribe({
      next: (res) => this.pendingCounts.update(c => ({ ...c, [key]: res.count })),
      error: () => {},
    });
  }

  // ── Load list ────────────────────────────────────────────────
  loadPending(): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.selectAll.set(false);
    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize(),
      search: this.filterSearch() || undefined,
      country: this.filterCountry() || undefined,
      dateFrom: this.filterDateFrom() || undefined,
      dateTo: this.filterDateTo() || undefined,
      sortBy: this.backendSortBy(),
      sortDir: this.sortDir(),
    };
    if (this.activeEntity() === 'community') {
      if (this.filterVisibility()) params['visibility'] = this.filterVisibility();
      if (this.filterIsDefault()) params['is_default'] = this.filterIsDefault() === 'true';
    }
    this.fetchPending(params).subscribe({
      next: (res: PaginatedResponse<PendingItem>) => {
        this.items.set(res.data);
        this.totalItems.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('admin.approval.toast.failedLoadPending', { entity: this.tabLabel() });
        this.loading.set(false);
      },
    });
  }

  // ── Filters ──────────────────────────────────────────────────
  onSearchInput(value: string): void {
    this.filterSearch.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => { this.currentPage.set(1); this.loadPending(); }, 350);
  }

  applyFilters(): void { this.currentPage.set(1); this.loadPending(); }

  clearFilters(): void {
    this.filterSearch.set('');
    this.filterCountry.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterVisibility.set('');
    this.filterIsDefault.set('');
    this.applyFilters();
  }

  toggleSort(field: 'joined' | 'name' | 'submitter' | 'meta'): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('desc');
    }
    this.applyFilters();
  }

  /** Posts don't have a "name" or "country" field — their equivalent
   * secondary/meta sort is by community name, which the backend calls
   * 'community' not 'name'/'country'. */
  private backendSortBy(): string {
    switch (this.sortBy()) {
      case 'joined':    return 'joined';
      case 'submitter': return 'submitter';
      case 'name':      return this.activeEntity() === 'posts' ? 'community' : 'name';
      case 'meta':      return this.activeEntity() === 'posts' ? 'community' : 'country';
    }
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadPending();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.loadPending();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getPages(): number[] {
    const total = this.totalPages(), current = this.currentPage(), maxVis = 5;
    let start = Math.max(1, current - Math.floor(maxVis / 2));
    const end = Math.min(total, start + maxVis - 1);
    start = Math.max(1, end - maxVis + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  /** A NEEDS_INFO item isn't actionable by the admin right now — it's waiting on the
   * submitter to resubmit — so it's shown read-only (no checkbox, no approve/reject/
   * request-info) with the reason surfaced instead. Currently only ever true for
   * communities, since that's the only entity whose pending list includes NEEDS_INFO rows. */
  isNeedsInfo(item: PendingItem): boolean { return item['status'] === 'NEEDS_INFO'; }

  /** Items eligible for selection/bulk actions — excludes read-only NEEDS_INFO rows. */
  selectableItems = computed(() => this.items().filter(i => !this.isNeedsInfo(i)));

  // ── Selection ────────────────────────────────────────────────
  toggleSelectAll(): void {
    if (this.selectAll()) {
      this.selectedIds.set(new Set());
      this.selectAll.set(false);
    } else {
      const selectable = this.selectableItems();
      this.selectedIds.set(new Set(selectable.map(i => i.id)));
      this.selectAll.set(selectable.length > 0);
    }
  }

  toggleSelect(id: string): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    const selectable = this.selectableItems();
    this.selectAll.set(this.selectedIds().size === selectable.length && selectable.length > 0);
  }

  isSelected(id: string): boolean { return this.selectedIds().has(id); }

  // ── Single approve / reject ─────────────────────────────────
  requestApprove(item: PendingItem): void { this.confirmApproveTarget.set(item); }
  cancelApproveConfirm(): void { this.confirmApproveTarget.set(null); }

  confirmApproveExecute(): void {
    const item = this.confirmApproveTarget();
    if (!item) return;
    this.approvingId.set(item.id);
    this.approveItem(item.id).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.totalItems.update(v => Math.max(0, v - 1));
        this.toast.success('admin.approval.toast.itemApproved', { entity: this.tabSingular() });
        this.approvingId.set(null);
        this.confirmApproveTarget.set(null);
        this.refreshCountForActiveEntity();
      },
      error: () => {
        this.toast.error('admin.approval.toast.failedApprove');
        this.approvingId.set(null);
        this.confirmApproveTarget.set(null);
      },
    });
  }

  requestReject(item: PendingItem): void {
    this.confirmRejectTarget.set(item);
    this.rejectReason.set('');
  }
  cancelRejectConfirm(): void { this.confirmRejectTarget.set(null); }

  confirmRejectExecute(): void {
    const item = this.confirmRejectTarget();
    if (!item) return;
    this.rejectingId.set(item.id);
    this.rejectItem(item.id, this.rejectReason().trim() || undefined).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.totalItems.update(v => Math.max(0, v - 1));
        this.toast.success('admin.approval.toast.itemRejected', { entity: this.tabSingular() });
        this.rejectingId.set(null);
        this.confirmRejectTarget.set(null);
        this.refreshCountForActiveEntity();
      },
      error: () => {
        this.toast.error('admin.approval.toast.failedReject');
        this.rejectingId.set(null);
        this.confirmRejectTarget.set(null);
      },
    });
  }

  // ── Single request-more-info ─────────────────────────────────
  requestRequestInfo(item: PendingItem): void {
    this.confirmMoreInfoTarget.set(item);
    this.moreInfoReason.set('');
  }
  cancelRequestInfoConfirm(): void { this.confirmMoreInfoTarget.set(null); }

  confirmRequestInfoExecute(): void {
    const item = this.confirmMoreInfoTarget();
    const reason = this.moreInfoReason().trim();
    if (!item || !reason) return;
    this.requestingInfoId.set(item.id);
    this.requestMoreInfoItem(item.id, reason).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.id !== item.id));
        this.totalItems.update(v => Math.max(0, v - 1));
        this.toast.success('admin.approval.toast.itemMoreInfoRequested', { entity: this.tabLabel() });
        this.requestingInfoId.set(null);
        this.confirmMoreInfoTarget.set(null);
        this.refreshCountForActiveEntity();
      },
      error: () => {
        this.toast.error('admin.approval.toast.failedRequestMoreInfo');
        this.requestingInfoId.set(null);
        this.confirmMoreInfoTarget.set(null);
      },
    });
  }

  // ── Bulk approve / reject / request-more-info ────────────────
  requestBulkApprove(): void { if (this.selectedCount() > 0) this.confirmBulkApprove.set(true); }
  requestBulkReject(): void {
    if (this.selectedCount() === 0) return;
    this.rejectReason.set('');
    this.confirmBulkReject.set(true);
  }
  requestBulkRequestInfo(): void {
    if (this.selectedCount() === 0) return;
    this.moreInfoReason.set('');
    this.confirmBulkMoreInfo.set(true);
  }
  cancelBulkConfirm(): void {
    this.confirmBulkApprove.set(false);
    this.confirmBulkReject.set(false);
    this.confirmBulkMoreInfo.set(false);
  }

  confirmBulkApproveExecute(): void { this.runBulk('approve'); }
  confirmBulkRejectExecute(): void { this.runBulk('reject'); }
  confirmBulkRequestInfoExecute(): void {
    if (!this.moreInfoReason().trim()) return;
    this.runBulk('requestMoreInfo');
  }

  private runBulk(action: 'approve' | 'reject' | 'requestMoreInfo'): void {
    const ids = Array.from(this.selectedIds());
    if (!ids.length) return;
    this.bulkProcessing.set(true);
    const reason = action === 'reject' ? (this.rejectReason().trim() || undefined)
      : action === 'requestMoreInfo' ? this.moreInfoReason().trim()
      : undefined;
    let succeeded = 0, failed = 0, completed = 0;

    const finish = () => {
      this.bulkProcessing.set(false);
      this.confirmBulkApprove.set(false);
      this.confirmBulkReject.set(false);
      this.confirmBulkMoreInfo.set(false);
      const successKey = action === 'approve' ? 'admin.approval.toast.bulkApproved'
        : action === 'reject' ? 'admin.approval.toast.bulkRejected'
        : 'admin.approval.toast.bulkMoreInfoRequested';
      if (succeeded) this.toast.success(successKey, { count: succeeded, entity: this.tabLabel() });
      if (failed) this.toast.error('admin.approval.toast.bulkFailed', { count: failed });
      this.refreshCountForActiveEntity();
      this.loadPending();
    };

    ids.forEach((id) => {
      const obs = action === 'approve' ? this.approveItem(id)
        : action === 'reject' ? this.rejectItem(id, reason)
        : this.requestMoreInfoItem(id, reason as string);
      obs.subscribe({
        next: () => { succeeded++; completed++; if (completed === ids.length) finish(); },
        error: () => { failed++; completed++; if (completed === ids.length) finish(); },
      });
    });
  }

  // ── View detail popup ────────────────────────────────────────
  viewItem(item: PendingItem): void { this.viewingItem.set(item); }
  closeViewItem(): void { this.viewingItem.set(null); }

  // ── Image lightbox — same implementation as the Community post image
  // viewer (community-detail.component.ts's cd-lightbox), not the generic
  // <app-image-viewer> component. ──────────────────────────────────────
  openImagePreview(images: string[], startIndex = 0): void {
    if (!images?.length) return;
    this.lightboxImages.set(images);
    this.activeImageIndex.set(Math.max(0, Math.min(startIndex, images.length - 1)));
    this.lightboxOpen.set(true);
  }

  closeImagePreview(): void {
    this.lightboxOpen.set(false);
    this.lightboxImages.set([]);
    this.activeImageIndex.set(0);
  }

  nextPreviewImage(): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    this.activeImageIndex.update((current) => (current + 1) % images.length);
  }

  prevPreviewImage(): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    this.activeImageIndex.update((current) => (current - 1 + images.length) % images.length);
  }

  getActivePreviewImage(): string | null {
    const images = this.lightboxImages();
    const index = this.activeImageIndex();
    if (!images.length || index < 0 || index >= images.length) return null;
    return images[index] ?? null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onLightboxEscapeKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.closeImagePreview();
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  onLightboxArrowRightKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.nextPreviewImage();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  onLightboxArrowLeftKey(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) return;
    event.preventDefault();
    this.prevPreviewImage();
  }

  // ── Field accessors — the five entities use different field names for
  // the same concept (name/title/content, createdBy/user, image/logo/images). ──
  itemName(item: PendingItem): string {
    if (this.activeEntity() === 'posts') {
      const content = (item['content'] as string | undefined)?.trim();
      if (!content) return `${item['type'] ?? 'General'} post`;
      return content.length > 60 ? content.slice(0, 60) + '…' : content;
    }
    return item['name'] ?? item['title'] ?? '—';
  }

  itemSubmitter(item: PendingItem): { displayName?: string; userName?: string } | undefined {
    return this.activeEntity() === 'community' ? item['createdBy'] : item['user'];
  }

  itemThumb(item: PendingItem): string | null {
    switch (this.activeEntity()) {
      case 'community': return item['image'] ?? null;
      case 'business':  return item['logo'] ?? item['images']?.[0] ?? null;
      case 'jobs':       return item['companyLogo'] ?? item['images']?.[0] ?? null;
      case 'events':     return item['images']?.[0] ?? null;
      case 'posts':      return item['images']?.[0] ?? null;
      default:           return null;
    }
  }

  itemImages(item: PendingItem): string[] {
    // Community only carries a single `image` field (no `images` array) —
    // fold it into the same shape so the popup's Images section (with its
    // click-to-expand image viewer) picks it up automatically, right after
    // the Rules section.
    if (this.activeEntity() === 'community') {
      return item['image'] ? [item['image']] : [];
    }
    return item['images'] ?? [];
  }

  /** Business's logo / Job's company logo — shown as their own section,
   * separate from the gallery `images` (unlike Community, which has no
   * separate gallery). */
  itemLogo(item: PendingItem): string | null {
    switch (this.activeEntity()) {
      case 'business': return item['logo'] ?? null;
      case 'jobs':      return item['companyLogo'] ?? null;
      default:          return null;
    }
  }

  itemLogoLabel(): string {
    return this.activeEntity() === 'jobs' ? 'admin.approval.section.companyIcon' : 'admin.approval.section.businessIcon';
  }
  itemDescription(item: PendingItem): string {
    if (this.activeEntity() === 'posts') return item['content'] ?? '';
    return item['description'] ?? '';
  }

  /** 3rd table column — "Country" for most entities, but posts don't carry
   * a country, so show the community they were posted in instead. */
  itemMetaLabel(): string { return this.activeEntity() === 'posts' ? 'Community' : 'Country'; }
  itemMeta(item: PendingItem): string {
    if (this.activeEntity() === 'posts') return item['community']?.name ?? '—';
    return item['country'] ?? '—';
  }

  /** Visibility column — community-only, so the table only renders it while
   * the Community tab is active (see approval.component.html). */
  itemVisibility(item: PendingItem): 'Global' | 'Private' | null {
    if (item['is_global']) return 'Global';
    if (item['is_private']) return 'Private';
    return null;
  }

  // ── Rich detail-popup sections — a full field-by-field breakdown per
  // entity, since each carries very different data. ────────────────────
  private fmt(v: unknown): string {
    return (v === null || v === undefined || v === '') ? '—' : String(v);
  }
  private fmtBool(v: unknown): string { return this.t(v ? 'common.yes' : 'common.no'); }
  private fmtList(v: unknown): string {
    return Array.isArray(v) && v.length ? v.join(', ') : '—';
  }
  /** Section field *values* are rendered raw (only the labels go through the
   * translate pipe), so any literal built here has to be resolved up front. */
  private t(key: string): string { return this.translate.instant(key) as string; }

  itemDetailSections(item: PendingItem): { title: string; icon: string; fields: { label: string; value: string }[] }[] {
    switch (this.activeEntity()) {
      case 'posts':
        return [
          { title: 'admin.approval.section.post', icon: 'bi-file-earmark-text', fields: [
            { label: 'admin.approval.label.type', value: this.fmt(item['type']) },
            { label: 'admin.approval.label.community', value: this.fmt(item['community']?.name) },
          ]},
        ];

      case 'community':
        return [
          { title: 'admin.approval.section.overview', icon: 'bi-info-circle', fields: [
            { label: 'admin.approval.label.category', value: this.fmt(item['category_name']) },
            { label: 'admin.approval.label.country', value: this.fmt(item['country']) },
          ]},
          { title: 'admin.approval.section.visibility', icon: 'bi-eye', fields: [
            { label: 'admin.approval.label.visibility', value: this.t(item['is_global'] ? 'admin.community.visibilityGlobal' : item['is_private'] ? 'admin.community.visibilityPrivate' : 'admin.approval.value.standard') },
            { label: 'admin.approval.label.defaultCommunity', value: this.fmtBool(item['is_default']) },
            { label: 'admin.approval.label.mode', value: this.fmtList((item['community_modes'] as string[] | undefined)?.map((m) => this.t(m === 'HELP' ? 'components.communityForm.mode.help' : m === 'EMERGENCY' ? 'components.communityForm.mode.emergency' : 'components.communityForm.mode.enquire'))) },
          ]},
          { title: 'admin.approval.section.rules', icon: 'bi-list-check', fields: [
            { label: 'admin.approval.label.communityRules', value: this.fmtList(item['rules']) },
          ]},
        ];

      case 'business':
        return [
          { title: 'admin.approval.section.overview', icon: 'bi-info-circle', fields: [
            { label: 'admin.approval.label.category', value: this.fmt(item['category']?.name) },
            { label: 'admin.approval.label.address', value: this.fmt(item['address']) },
            { label: 'admin.approval.label.city', value: this.fmt(item['city']) },
            { label: 'admin.approval.label.state', value: this.fmt(item['state']) },
            { label: 'admin.approval.label.country', value: this.fmt(item['country']) },
            { label: 'admin.approval.label.pincode', value: this.fmt(item['pincode']) },
          ]},
          { title: 'admin.approval.section.contact', icon: 'bi-telephone', fields: [
            { label: 'admin.approval.label.phone', value: this.fmt(item['phone']) },
            { label: 'admin.approval.label.email', value: this.fmt(item['email']) },
            { label: 'admin.approval.label.website', value: this.fmt(item['website']) },
            { label: 'admin.approval.label.whatsapp', value: this.fmt(item['whatsapp']) },
          ]},
          { title: 'admin.approval.section.hours', icon: 'bi-clock', fields: [
            { label: 'admin.approval.label.openingHours', value: this.fmt(item['opening_hours']) },
            { label: 'admin.approval.label.openingDays', value: this.fmt(item['opening_days']) },
          ]},
        ];

      case 'jobs':
        return [
          { title: 'admin.approval.section.company', icon: 'bi-building', fields: [
            { label: 'admin.approval.label.companyName', value: this.fmt(item['companyName']) },
            { label: 'admin.approval.label.website', value: this.fmt(item['companyWebsite']) },
          ]},
          { title: 'admin.approval.section.role', icon: 'bi-briefcase', fields: [
            { label: 'admin.approval.label.jobType', value: this.fmt(item['jobType']) },
            { label: 'admin.approval.label.workMode', value: this.fmt(item['workMode']) },
            { label: 'admin.approval.label.experience', value: (item['expMin'] != null || item['expMax'] != null) ? `${item['expMin'] ?? 0}–${item['expMax'] ?? '∞'} ${this.t('admin.approval.value.yrs')}` : '—' },
            { label: 'admin.approval.label.education', value: this.fmt(item['education']) },
            { label: 'admin.approval.label.openings', value: this.fmt(item['openings']) },
            { label: 'admin.approval.label.shift', value: this.fmt(item['shiftType']) },
          ]},
          { title: 'admin.approval.section.salary', icon: 'bi-cash-stack', fields: [
            { label: 'admin.approval.label.salary', value: item['salaryHidden']
              ? this.t('admin.approval.value.hidden')
              : (item['salaryMin'] || item['salaryMax'])
                ? `${item['salaryCurrency'] ?? ''} ${item['salaryMin'] ?? '?'} – ${item['salaryMax'] ?? '?'} (${item['salaryType'] ?? ''})`
                : this.fmt(item['salary']) },
          ]},
          { title: 'admin.approval.section.location', icon: 'bi-geo-alt', fields: [
            { label: 'admin.approval.label.city', value: this.fmt(item['city']) },
            { label: 'admin.approval.label.state', value: this.fmt(item['state']) },
            { label: 'admin.approval.label.country', value: this.fmt(item['country']) },
            { label: 'admin.approval.label.address', value: this.fmt(item['fullAddress'] ?? item['location']) },
          ]},
          { title: 'admin.approval.section.contact', icon: 'bi-telephone', fields: [
            { label: 'admin.approval.label.contactPerson', value: this.fmt(item['contactPerson']) },
            { label: 'admin.approval.label.email', value: this.fmt(item['contactEmail']) },
            { label: 'admin.approval.label.phone', value: this.fmt(item['contactPhone']) },
            { label: 'admin.approval.label.applicationUrl', value: this.fmt(item['applicationUrl']) },
          ]},
          { title: 'admin.approval.section.skills', icon: 'bi-stars', fields: [
            { label: 'admin.approval.label.skills', value: this.fmtList(item['skills']) },
          ]},
        ];

      case 'events':
        return [
          { title: 'admin.approval.section.overview', icon: 'bi-info-circle', fields: [
            { label: 'admin.approval.label.category', value: this.fmt(item['eventCategory']) },
            { label: 'admin.approval.label.mode', value: this.fmt(item['eventMode']) },
            { label: 'admin.approval.label.date', value: this.fmt(item['eventDate']) },
            { label: 'admin.approval.label.time', value: item['eventTime'] ? `${item['eventTime']}${item['eventEndTime'] ? ' – ' + item['eventEndTime'] : ''}` : '—' },
            { label: 'admin.approval.label.timezone', value: this.fmt(item['timezone']) },
          ]},
          { title: 'admin.approval.section.location', icon: 'bi-geo-alt', fields: [
            { label: 'admin.approval.label.country', value: this.fmt(item['country']) },
            { label: 'admin.approval.label.location', value: this.fmt(item['location']) },
            { label: 'admin.approval.label.address', value: this.fmt(item['address']) },
            { label: 'admin.approval.label.pincode', value: this.fmt(item['pincode']) },
            { label: 'admin.approval.label.link', value: this.fmt(item['locationLink']) },
          ]},
        ];
    }
  }
}
