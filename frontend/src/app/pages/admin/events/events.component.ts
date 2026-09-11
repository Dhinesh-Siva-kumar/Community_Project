import { Component, OnInit, OnDestroy, HostListener, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, EventCategory, VisibilityType, PaginatedResponse, Country } from '../../../core/models';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { EventFormModalComponent } from '../../../shared/components/event-form-modal/event-form-modal.component';
import { EventCategoryManagerComponent } from '../../../shared/components/event-category-manager/event-category-manager.component';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard';
import { formatEventAddress as formatEventAddressUtil, eventLocationSummary as eventLocationSummaryUtil, eventModeCategorySummary as eventModeCategorySummaryUtil } from '../../../shared/utils/event-location';
import { formatEventTimeRange as formatEventTimeRangeUtil, eventCardDateTimeLabel as eventCardDateTimeLabelUtil } from '../../../shared/utils/event-date-format';

// Remembers the last selected view mode (grid/table) across navigations.
const VIEW_STORAGE_KEY = 'admin-events:viewMode';

/** Every column the table view can sort by (all but Actions). */
type EventSortField = 'name' | 'eventDate' | 'joined' | 'category' | 'mode' | 'location' | 'status';

@Component({
  selector: 'app-admin-events',
  standalone: true,
  imports: [DateInputComponent, CommonModule, FormsModule, DatePipe, RouterLink, ImageErrorHandlerDirective, ScrollLockDirective, SearchableSelectComponent, SortBarComponent, EventFormModalComponent, EventCategoryManagerComponent, EventDateBadgeComponent, ImageUrlPipe, TranslatePipe, EnumLabelPipe],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the events list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class AdminEventsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private eventService = inject(EventService);
  private authService = inject(AuthService);
  private layoutService = inject(LayoutService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private translate = inject(TranslateService);

  @ViewChild('eventFormModal') eventFormModal?: EventFormModalComponent;

  /** Backs the `admin/events` route's `canDeactivate: [unsavedChangesGuard]` — see app.routes.ts. */
  hasUnsavedChanges(): boolean {
    return !!this.eventFormModal?.isDirty();
  }

  ngOnDestroy(): void {
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
  // Gates the full-page skeleton — true only until the very first fetch
  // resolves, then stays true forever after. Later fetches (stat-card
  // click, search, filter, sort) still flip `loading`, but the stats bar /
  // results meta / list stay mounted throughout instead of unmounting into
  // a skeleton and back, which read as the whole page blinking.
  pageReady  = signal(false);
  skeletons  = Array(6);

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

  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  searchQuery = signal('');
  filterCountry  = signal('');
  filterStatus   = signal<'upcoming' | 'completed' | ''>('');
  filterEventMode = signal<'Offline' | 'Online' | 'Hybrid' | ''>('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  activeQuickRange = signal<'today' | '7d' | '30d' | null>(null);
  // Opt-in visibility filter, independent of the automatic country/worldwide
  // access gate applied server-side (mirrors the user Events/Jobs pages).
  filterVisibility = signal<'' | VisibilityType>('');
  // Category filter — DB-backed (event_categories table). Loads the FULL
  // list (not active-only): unlike the Add/Edit picker, admin needs to be
  // able to filter by/find events still using a disabled/legacy category.
  filterCategory = signal('');
  categories = signal<EventCategory[]>([]);
  categoryFilterOptions = computed<SelectOption[]>(() =>
    this.categories().map((c) => ({ value: c.name, label: c.name, icon: c.icon })),
  );
  showCategoryManager = signal(false);
  private searchDebounce: any = null;

  // Premium filter UI state
  showAdvancedFilters = signal(false);
  viewMode = signal<'grid' | 'table'>('grid');

  filterCountryOptions: SelectOption[] = [];
  readonly statusFilterOptions: SelectOption[] = [
    { value: '',          label: 'admin.events.label.allStatus' },
    { value: 'upcoming',  label: 'admin.events.label.upcoming' },
    { value: 'completed', label: 'admin.events.label.completed' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize = signal(20);

  // ── Sort — driven by the sort-bar above the grid ────────────
  readonly sortFields: SortField[] = [
    { key: 'joined',    label: 'admin.events.label.created' },
    { key: 'eventDate', label: 'admin.events.label.eventDate' },
    { key: 'name',      label: 'admin.events.label.name' },
  ];
  sortBy  = signal<EventSortField>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as EventSortField);
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode.set(mode);
    sessionStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  /** Toggle sort for a clickable table column header — re-clicking the same column flips direction. */
  toggleSort(field: EventSortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('desc');
    }
    this.applyFilters();
  }

  // Stat-card counts — fetched separately (see loadEventStatCounts()) so
  // each card always shows its own true total regardless of which card is
  // currently selected, instead of being derived from whatever page
  // `events()` currently holds (which — once a card filters the list — no
  // longer contains any of the OTHER cards' events, making their counts
  // collapse to 0 and making the stat bar look broken).
  totalEventsCount    = signal(0);
  upcomingEventsCount = signal(0);
  hybridEventsCount   = signal(0);
  offlineEventsCount  = signal(0);
  // Bumped on every loadEventStatCounts() call and captured per in-flight
  // request — an older scope's response (e.g. the "Completed" Offline count,
  // which is legitimately 0 whenever nothing completed is Offline) landing
  // AFTER a newer one (e.g. after switching to "All Events") would otherwise
  // silently overwrite the correct number with a stale one.
  private statCountsRequestId = 0;

  // Server-side filtering: component list is whatever the API returned.
  filteredEvents = computed(() => this.events());

  // Computed property: count of active filters
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchQuery()) count++;
    if (this.filterCountry()) count++;
    if (this.filterStatus()) count++;
    if (this.filterEventMode()) count++;
    if (this.filterVisibility()) count++;
    if (this.filterCategory()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  // ── Add/Edit Event modal — the form itself is app-event-form-modal
  // (shared with the user Events page); this component only tracks
  // open/closed state and which id (if any) is being edited. ──
  showAddModal      = signal(false);
  editEventId       = signal<string | null>(null);
  showDeleteConfirm = signal(false);
  eventToDelete     = signal<AppEvent | null>(null);
  deleting          = signal(false);

  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;

  ngOnInit(): void { this.restoreSavedViewMode(); this.loadEvents(); this.loadCountries(); this.loadCategories(); }

  /** Resume the last selected grid/table view across navigations. */
  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'grid' || saved === 'table') this.viewMode.set(saved);
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({ value: c.name, label: c.name }));
      },
    });
  }

  loadCategories(): void {
    this.eventService.getCategories().subscribe({
      next: (data) => this.categories.set(data),
      error: () => {},
    });
  }

  openCategoryManager(): void { this.showCategoryManager.set(true); }
  closeCategoryManager(): void { this.showCategoryManager.set(false); this.loadCategories(); }

  loadEvents(): void {
    this.loading.set(true);
    this.loadEventStatCounts();
    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    if (this.searchQuery().trim()) params['search'] = this.searchQuery().trim();
    if (this.filterCountry())      params['country'] = this.filterCountry();
    if (this.filterStatus())       params['status']  = this.filterStatus();
    if (this.filterEventMode())    params['eventMode'] = this.filterEventMode();
    if (this.filterVisibility())   params['visibilityType'] = this.filterVisibility();
    if (this.filterCategory())     params['eventCategory'] = this.filterCategory();
    if (this.filterDateFrom())     params['dateFrom'] = this.filterDateFrom();
    if (this.filterDateTo())       params['dateTo']   = this.filterDateTo();

    this.eventService.getEvents(params).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data); this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total); this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => { this.toast.error('admin.events.toast.failedLoadEvents'); this.loading.set(false); this.pageReady.set(true); },
    });
  }

  /** Powers the four stat cards — lightweight `limit:1` calls scoped by
   * search/country/quick-filter (every filter EXCEPT eventMode, which is
   * what the Hybrid/Offline cards themselves toggle — Total/Upcoming/
   * Hybrid/Offline stay in step with each other and with the mode you pick,
   * instead of collapsing whichever mode ISN'T selected to 0).
   *
   * The Upcoming/Past/All Events quick filter (`filterStatus`), on the
   * other hand, DOES scope every number here — selecting "Upcoming" should
   * show the breakdown of just the upcoming events (Total/Hybrid/Offline
   * recomputed within that subset), not the same global figures regardless
   * of what's actually listed below.
   *
   * No `approvalStatus` filter is applied: the admin table below
   * intentionally lists events of every moderation status (with a status
   * badge per row), so the cards must count that same set — pinning them to
   * APPROVED-only used to make a card's number disagree with what clicking
   * it actually listed (e.g. a PENDING Offline submission would show up in
   * the list but not get counted on the Offline card, while a mode with no
   * pending submissions looked "correct" purely by coincidence). Pending
   * review still has its own separate count elsewhere in the console. */
  private loadEventStatCounts(): void {
    const requestId = ++this.statCountsRequestId;
    // Discards a response from a scope that's no longer current — e.g. a
    // slow "Completed" Offline lookup (0) resolving after the user has
    // already switched to "All Events", which must show the real combined
    // (upcoming + completed) Offline count instead of being clobbered by 0.
    const isCurrent = () => requestId === this.statCountsRequestId;

    const activeStatus = this.filterStatus(); // '' | 'upcoming' | 'completed'
    const base: Record<string, any> = { page: 1, limit: 1 };
    if (this.searchQuery().trim()) base['search']  = this.searchQuery().trim();
    if (this.filterCountry())      base['country'] = this.filterCountry();
    if (activeStatus)              base['status']  = activeStatus;

    this.eventService.getEvents(base).subscribe({
      next: (res) => { if (isCurrent()) this.totalEventsCount.set(res.total); }, error: () => {},
    });

    // Upcoming and Completed are mutually exclusive by definition — a
    // Completed-scoped view can never contain an upcoming event, so that
    // count is 0 without a round trip; scoping to 'upcoming' on top of an
    // already-'upcoming' (or unfiltered) base is what a real API call needs.
    if (activeStatus === 'completed') {
      this.upcomingEventsCount.set(0);
    } else {
      this.eventService.getEvents({ ...base, status: 'upcoming' }).subscribe({
        next: (res) => { if (isCurrent()) this.upcomingEventsCount.set(res.total); }, error: () => {},
      });
    }
    this.eventService.getEvents({ ...base, eventMode: 'Hybrid' }).subscribe({
      next: (res) => { if (isCurrent()) this.hybridEventsCount.set(res.total); }, error: () => {},
    });
    this.eventService.getEvents({ ...base, eventMode: 'Offline' }).subscribe({
      next: (res) => { if (isCurrent()) this.offlineEventsCount.set(res.total); }, error: () => {},
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadEvents();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }

  setCountryFilter(v: string | number): void {
    this.filterCountry.set(v as string);
    this.applyFilters();
  }

  setStatusFilter(v: string | number): void {
    this.filterStatus.set(v as 'upcoming' | 'completed' | '');
    this.applyFilters();
  }

  setEventModeFilter(mode: 'Offline' | 'Online' | 'Hybrid' | null): void {
    this.filterEventMode.set(mode ?? '');
    this.applyFilters();
  }

  setVisibilityFilter(v: '' | VisibilityType): void {
    this.filterVisibility.set(v);
    this.applyFilters();
  }

  setCategoryFilter(v: string | number): void {
    this.filterCategory.set(v as string);
    this.applyFilters();
  }

  /** The four stat cards reuse the server-side `filterStatus` ("Status" in
   * Advanced Filters, and the Upcoming/Past/All Events quick filter pills)
   * and `filterEventMode` — but Upcoming and Hybrid/Offline are independent
   * axes (a quick filter of "Upcoming" plus a mode of "Hybrid" is a
   * perfectly valid combination), so each is highlighted independently
   * rather than only one of the four ever being "active" at a time. */
  isTotalCardActive    = computed(() => this.filterStatus() === '' && this.filterEventMode() === '');
  isUpcomingCardActive = computed(() => this.filterStatus() === 'upcoming');
  isHybridCardActive   = computed(() => this.filterEventMode() === 'Hybrid');
  isOfflineCardActive  = computed(() => this.filterEventMode() === 'Offline');

  /** Applies the clicked card's own filter directly (no toggle-off on a
   * repeat click — see git history for why) and, other than "Total" (the
   * explicit clear-everything card), leaves the OTHER axis untouched:
   * clicking Hybrid/Offline must not reset whichever quick filter
   * (Upcoming/Past/All Events) is currently selected, and vice versa,
   * so the two can be combined (e.g. Upcoming + Hybrid together). */
  setEventStatFilter(value: 'all' | 'upcoming' | 'hybrid' | 'offline'): void {
    if (value === 'all') {
      this.filterStatus.set('');
      this.filterEventMode.set('');
    } else if (value === 'upcoming') {
      this.filterStatus.set('upcoming');
    } else {
      this.filterEventMode.set(value === 'hybrid' ? 'Hybrid' : 'Offline');
    }
    this.applyFilters();
  }

  onFilterDateFromChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set(value);
    this.applyFilters();
  }

  onFilterDateToChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set(value);
    this.applyFilters();
  }

  applyQuickDatePreset(preset: 'today' | '7d' | '30d'): void {
    const today = new Date();
    const to = this.toInputDate(today);

    if (preset === 'today') {
      this.filterDateFrom.set(to);
      this.filterDateTo.set(to);
      this.activeQuickRange.set('today');
      this.applyFilters();
      return;
    }

    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - (preset === '7d' ? 6 : 29));
    this.filterDateFrom.set(this.toInputDate(fromDate));
    this.filterDateTo.set(to);
    this.activeQuickRange.set(preset);
    this.applyFilters();
  }

  private toInputDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.applyFilters();
  }

  /** Advanced Filters lives in a right-side drawer — while it's open, the
   * app shell's sidebar auto-minimizes (via LayoutService) for extra width. */
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
    this.layoutService.forceSidebarCollapsed.set(this.showAdvancedFilters());
  }

  closeAdvancedFilters(): void {
    this.showAdvancedFilters.set(false);
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.filterCountry.set('');
    this.filterStatus.set('');
    this.filterEventMode.set('');
    this.filterVisibility.set('');
    this.filterCategory.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.applyFilters();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'search':     this.searchQuery.set('');   break;
      case 'country':    this.filterCountry.set(''); break;
      case 'status':     this.filterStatus.set('');  break;
      case 'eventMode':  this.filterEventMode.set(''); break;
      case 'visibility': this.filterVisibility.set(''); break;
      case 'category':   this.filterCategory.set(''); break;
      case 'dateFrom':   this.filterDateFrom.set(''); break;
      case 'dateTo':     this.filterDateTo.set('');  break;
    }
    if (key === 'dateFrom' || key === 'dateTo') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  // ─── Add/Edit Event modal — the form itself is app-event-form-modal
  // (shared with the user Events page); it loads the full record itself,
  // so this component only tracks which id (if any) is being edited. ───
  openAddModal(): void {
    this.editEventId.set(null);
    this.showAddModal.set(true);
  }

  /** The whole card/row is clickable — this is what it navigates to (edit/delete/links inside it stop propagation so they don't also trigger this). */
  viewEventDetails(evt: AppEvent): void {
    this.router.navigate(['/admin/events', evt.id]);
  }

  openEditModal(evt: AppEvent, event: Event): void {
    event.stopPropagation();
    this.editEventId.set(evt.id);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editEventId.set(null);
  }

  onEventSaved(evt: AppEvent): void {
    const wasEditing = this.editEventId() !== null;
    if (wasEditing) {
      this.events.update(l => l.map(e => e.id === evt.id ? evt : e));
    } else {
      this.events.update(l => [evt, ...l]);
      this.totalItems.update(v => v + 1);
    }
    // Create/edit can change status (auto-approve), date/time, or mode —
    // any of which the stat cards above depend on.
    this.loadEventStatCounts();
  }

  openDeleteConfirm(evt: AppEvent, event: Event): void {
    event.stopPropagation(); this.eventToDelete.set(evt); this.showDeleteConfirm.set(true);
  }
  closeDeleteConfirm(): void { this.showDeleteConfirm.set(false); this.eventToDelete.set(null); }
  confirmDelete(): void {
    const evt = this.eventToDelete(); if (!evt) return;
    this.deleting.set(true);
    this.eventService.deleteEvent(evt.id).subscribe({
      next: () => { this.events.update(l => l.filter(e => e.id !== evt.id)); this.totalItems.update(v => v - 1); this.loadEventStatCounts(); this.toast.success('admin.events.toast.eventDeleted'); this.closeDeleteConfirm(); this.deleting.set(false); },
      error: () => { this.toast.error('admin.events.toast.failedDeleteEvent'); this.deleting.set(false); },
    });
  }
  // backward compat
  deleteEvent(id: string): void { const e = this.events().find(x => x.id === id); if (e) this.openDeleteConfirm(e, new MouseEvent('click')); }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page); this.loadEvents();
  }
  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let s = Math.max(1, cur - Math.floor(max/2));
    const e = Math.min(total, s + max - 1); s = Math.max(1, e - max + 1);
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  }

  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }
  truncate(text: string | undefined, n: number): string {
    if (!text) return ''; return text.length > n ? text.substring(0, n) + '…' : text;
  }

  categoryIcon(cat?: string): string { return this.categories().find((c) => c.name === cat)?.icon ?? 'bi-calendar-event'; }

  getEventStatus(evt: AppEvent): { label: string; type: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(evt.eventDate);
    
    if (eventDate >= today) {
      return { label: 'admin.events.label.upcoming', type: 'upcoming' };
    } else {
      return { label: 'admin.events.label.completed', type: 'completed' };
    }
  }

  /** "09:11" + "11:12" → "9:11 AM – 11:12 AM" — no timezone appended; shown
   * as its own field on the full Event Details page instead. */
  formatEventTime(evt: AppEvent): string {
    return formatEventTimeRangeUtil(evt.eventTime, evt.eventEndTime);
  }

  /** "Thu · 24 Sep · 6:00 AM" — the compact single-line date/time used on
   * event cards, same for Online/Offline/Hybrid alike. */
  eventCardDateTimeLabel(evt: AppEvent): string {
    return eventCardDateTimeLabelUtil(evt);
  }

  /** Address + Venue/City - Pincode, Country → "12 Main St, City Hall - 600001, India" — Offline/Hybrid only, see eventLocationSummary() for the Online-aware version. */
  formatEventAddress(evt: AppEvent): string {
    return formatEventAddressUtil(evt);
  }

  /** "Online Event · Worldwide"/"...Country Based" for Online events (never a physical address); the real address for Offline/Hybrid. */
  eventLocationSummary(evt: AppEvent): string {
    return eventLocationSummaryUtil(evt, (key) => this.translate.instant(key));
  }

  /** "Offline · Sports" / "Online · Workshop" — mode and category separated with " · ", never concatenated raw. */
  eventModeCategorySummary(evt: AppEvent): string {
    return eventModeCategorySummaryUtil(evt);
  }
}
