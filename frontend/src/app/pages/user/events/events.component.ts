import { Component, OnInit, OnDestroy, HostListener, ElementRef, inject, signal, computed, effect, viewChildren } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EventService, EventsQueryParams } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, VisibilityType, PaginatedResponse, Country } from '../../../core/models';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { EventFormModalComponent } from '../../../shared/components/event-form-modal/event-form-modal.component';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';
import { EVENT_CATEGORIES, EVENT_CATEGORY_ICON, EVENT_CATEGORY_GRADIENT } from '../../../shared/constants/event-categories';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';

type ModeFilter = 'all' | 'Offline' | 'Online' | 'Hybrid';
/** '' = All Events. Drives the quick filter in the search card — defaults to 'upcoming'. */
type StatusFilter = 'upcoming' | 'completed' | '';

@Component({
  selector: 'app-user-events',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink, ImageViewerComponent, ImageUrlPipe, SearchableSelectComponent, DateInputComponent, EventFormModalComponent, EventDateBadgeComponent, InfiniteScrollDirective, ScrollLockDirective, TranslatePipe, EnumLabelPipe],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the events list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class UserEventsComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private eventService = inject(EventService);
  private authService  = inject(AuthService);
  private layoutService = inject(LayoutService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
  skeletons  = Array(10);

  // ── Page tab — 'all' = public browse, 'pending' = the caller's own submissions ──
  pageTab              = signal<'all' | 'pending'>('all');
  myPendingEventsCount = signal(0);

  // ── Grid / List view — same card markup either way (see .ev-list-view),
  // just a denser multi-column layout for List, mirroring the Business page.
  viewMode = signal<'grid' | 'list'>('grid');

  // ── All/Pending tabs — sliding active-pill indicator, position/width
  // read from the real active button (same approach as the User Community
  // page's .uc-tab-indicator) instead of a fixed 50%/translateX(100%) split,
  // which ignores the row's flex gap and bleeds onto the neighbouring tab. ──
  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  tabIndicatorLeft  = signal(0);
  tabIndicatorWidth = signal(0);
  tabIndicatorReady = signal(false);

  constructor() {
    effect(() => {
      this.tabButtons();
      this.pageTab();
      this.updateTabIndicator();
    });

  }

  @HostListener('window:resize')
  onTabRowResize(): void {
    this.updateTabIndicator();
  }

  private updateTabIndicator(): void {
    const idx = this.pageTab() === 'all' ? 0 : 1;
    const btn = this.tabButtons()[idx]?.nativeElement;
    if (!btn) return;
    this.tabIndicatorLeft.set(btn.offsetLeft);
    this.tabIndicatorWidth.set(btn.offsetWidth);
    this.tabIndicatorReady.set(true);
  }

  // ── Infinite scroll — loads 10 events at a time; loadEvents() (re)starts
  // from page 1 and replaces the list (filters/tab/sort changes), while
  // loadMoreEvents() appends the next page once the sentinel at the bottom
  // of the grid scrolls into view. ──
  readonly pageSize = 10;
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);
  loadingMore = signal(false);
  hasMore     = computed(() => this.currentPage() < this.totalPages());

  searchQuery = signal('');
  modeFilter  = signal<ModeFilter>('all');
  private searchDebounce: any = null;

  readonly EVENT_MODES = ['Offline', 'Online', 'Hybrid'] as const;

  // ── Advanced filters — Country + Event Date range (mirrors the Business
  // page's search card: search + quick status filter in the top row,
  // everything else collapsed behind Advanced Filters) ──
  filterCountry        = signal<string | null>(null);
  filterCountryOptions: SelectOption[] = [];
  filterDateFrom        = signal('');
  filterDateTo          = signal('');
  activeQuickRange      = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters   = signal(false);

  // ── Visibility filter — opt-in ("show me only Worldwide events"),
  // independent of the automatic country/worldwide access gate applied
  // server-side. Mirrors the Jobs page's filterVisibilityType pill filter. ──
  filterVisibility = signal<'' | VisibilityType>('');

  // ── Category filter — same option list the Add/Edit Event form uses. ──
  readonly categoryFilterOptions: SelectOption[] = EVENT_CATEGORIES.map((c) => ({ value: c, label: c }));
  filterCategory = signal('');

  // ── Status quick filter — Upcoming (default) / Past / All Events, front
  // and center in the search card rather than buried in Advanced Filters,
  // so a visitor sees only upcoming events first. Since 'upcoming' is the
  // default rather than an opt-in extra, it's a primary view toggle (like
  // the All/Pending page tabs above it) and isn't counted as an "active
  // filter" or removable via a chip.
  filterStatus = signal<StatusFilter>('upcoming');

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.modeFilter() !== 'all') count++;
    if (this.filterCountry()) count++;
    if (this.filterVisibility()) count++;
    if (this.filterCategory()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  currentUser   = computed(() => this.authService.currentUser());
  currentUserId = computed(() => this.currentUser()?.id ?? null);
  userPincode   = computed(() => this.currentUser()?.pincode ?? '');
  isAdmin       = computed(() => this.currentUser()?.role === 'ADMIN');

  // ── add / edit modal (form owned by app-event-form-modal) ──
  showAddModal = signal(false);
  editingId    = signal<string | null>(null);

  // ── card — expandable description + scroll-to-and-highlight (deep link) ──
  expandedDescriptions = signal<Set<string>>(new Set());
  highlightedEventId   = signal<string | null>(null);

  // ── delete confirm ──
  eventToDelete = signal<AppEvent | null>(null);
  deleting      = signal(false);

  // ── image viewer ──
  imageViewerOpen = signal(false);
  imageViewerImages = signal<string[]>([]);
  imageViewerInitialIndex = signal(0);

  ngOnInit(): void {
    this.loadEvents();
    this.loadCountries();
    this.route.queryParams.subscribe(params => {
      const eventId = params['eventId'];
      if (eventId) this.openEventFromQueryParam(eventId);
      // Deep-link support — e.g. the Profile page's "My Events" tab
      // navigates here with ?openAdd=1 to jump straight into Add Event.
      if (params['openAdd']) {
        this.openAddModal();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { openAdd: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
    this.loadMyPendingEventsCount();
  }

  ngOnDestroy(): void {
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res: any) => {
        this.filterCountryOptions = (res.data ?? res ?? []).map((c: Country) => ({ value: c.name, label: c.name }));
      },
      error: () => {},
    });
  }

  setPageTab(tab: 'all' | 'pending'): void {
    if (this.pageTab() === tab) return;
    this.pageTab.set(tab);
    if (tab === 'pending') {
      this.loadMyEvents();
    } else {
      this.currentPage.set(1);
      this.loadEvents();
    }
  }

  /** "Pending Approval" tab — the caller's own events still awaiting admin
   * action: freshly submitted (PENDING) or kicked back for more info (NEEDS_INFO). */
  loadMyEvents(): void {
    this.loading.set(true);
    this.currentPage.set(1);
    this.eventService.getMyEvents({ page: 1, limit: 100, approvalStatus: ['PENDING', 'NEEDS_INFO'] }).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data);
        this.totalItems.set(res.total);
        this.totalPages.set(1);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('user.events.toast.failedLoadEvents');
        this.loading.set(false);
      },
    });
  }

  loadMyPendingEventsCount(): void {
    this.eventService.getMyEvents({ page: 1, limit: 1, approvalStatus: ['PENDING', 'NEEDS_INFO'] }).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => this.myPendingEventsCount.set(res.total),
      error: () => {},
    });
  }

  // Deep-link support — the dashboard calendar navigates here with
  // ?eventId=xxx to scroll to and briefly highlight that event's card. The
  // target event may not be on the currently loaded/sorted page, so it's
  // fetched directly and prepended if it isn't already in `events()`.
  private openEventFromQueryParam(id: string): void {
    this.eventService.getEvent(id).subscribe({
      next: evt => {
        if (!this.events().some(e => e.id === id)) {
          this.events.update(list => [evt, ...list]);
        }
        this.highlightedEventId.set(id);
        setTimeout(() => {
          document.getElementById('event-card-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
        setTimeout(() => this.highlightedEventId.set(null), 3000);
      },
      error: () => this.toast.error('user.events.toast.eventNotFoundNoLonger'),
    });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { eventId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ── data loading ──
  private buildEventsQueryParams(page: number): EventsQueryParams {
    const mode = this.modeFilter();
    return {
      page,
      limit: this.pageSize,
      search: this.searchQuery() || undefined,
      eventMode: mode === 'all' ? undefined : mode,
      country: this.filterCountry() || undefined,
      visibilityType: this.filterVisibility() || undefined,
      eventCategory: this.filterCategory() || undefined,
      status: this.filterStatus() || undefined,
      eventDateFrom: this.filterDateFrom() || undefined,
      eventDateTo: this.filterDateTo() || undefined,
      // Soonest first — pairs naturally with the Upcoming quick filter above.
      sortBy: 'eventDate',
      sortDir: 'asc',
    };
  }

  /** (Re)starts from page 1 and replaces the list — used on load, and whenever search/filters/tab/sort change. */
  loadEvents(): void {
    this.loading.set(true);
    this.currentPage.set(1);
    this.eventService.getEvents(this.buildEventsQueryParams(1)).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.loading.set(false);
      },
      error: () => { this.toast.error('user.events.toast.failedLoadEvents2'); this.loading.set(false); },
    });
  }

  /** Appends the next page — triggered by the sentinel at the bottom of the grid scrolling into view. */
  loadMoreEvents(): void {
    if (this.loading() || this.loadingMore() || !this.hasMore()) return;
    const nextPage = this.currentPage() + 1;
    this.loadingMore.set(true);
    this.eventService.getEvents(this.buildEventsQueryParams(nextPage)).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.update(list => [...list, ...res.data]);
        this.currentPage.set(nextPage);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.loadingMore.set(false);
      },
      error: () => { this.toast.error('user.events.toast.failedLoadMoreEvents'); this.loadingMore.set(false); },
    });
  }

  applyFilters(): void { this.loadEvents(); }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }
  clearSearch(): void { this.searchQuery.set(''); this.applyFilters(); }
  setModeFilter(mode: ModeFilter): void { this.modeFilter.set(mode); this.applyFilters(); }

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

  onFilterCountryChange(value: string | null): void {
    this.filterCountry.set(value);
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

  setStatusFilter(v: StatusFilter): void {
    this.filterStatus.set(v);
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

  /** Fills From/To Date with a preset range (mirrors the Business list page's quick date presets). */
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

  removeFilter(key: 'mode' | 'country' | 'visibility' | 'category' | 'dateFrom' | 'dateTo'): void {
    switch (key) {
      case 'mode':       this.modeFilter.set('all'); break;
      case 'country':    this.filterCountry.set(null); break;
      case 'visibility': this.filterVisibility.set(''); break;
      case 'category':   this.filterCategory.set(''); break;
      case 'dateFrom':   this.filterDateFrom.set(''); break;
      case 'dateTo':     this.filterDateTo.set(''); break;
    }
    if (key === 'dateFrom' || key === 'dateTo') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.modeFilter.set('all');
    this.filterCountry.set(null);
    this.filterVisibility.set('');
    this.filterCategory.set('');
    // Not reset to '' — Upcoming is the default view, not an "extra" filter.
    this.filterStatus.set('upcoming');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.showAdvancedFilters.set(false);
    this.applyFilters();
  }

  // ── helpers ──
  isMine(evt: AppEvent): boolean {
    const uid = this.currentUserId();
    return !!uid && (evt.userId === uid || this.isAdmin());
  }
  isNear(evt: AppEvent): boolean {
    const pin = this.userPincode();
    return !!pin && evt.eventMode !== 'Online' && evt.pincode === pin;
  }
  categoryIcon(cat?: string): string { return EVENT_CATEGORY_ICON[cat ?? ''] ?? 'bi-calendar-event'; }
  categoryGradient(cat?: string): string { return EVENT_CATEGORY_GRADIENT[cat ?? ''] ?? 'g-meet'; }

  relTime(dateStr: string): { label: string; cls: string; isPast: boolean } {
    const d = new Date(dateStr);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((eventDay.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { label: 'user.events.countdown.past', cls: 'is-past', isPast: true };
    if (days === 0) return { label: 'user.events.countdown.today', cls: 'is-soon', isPast: false };
    if (days === 1) return { label: 'user.events.countdown.tomorrow', cls: 'is-soon', isPast: false };
    if (days <= 14) return { label: this.translate.instant('components.calendar.status.inDays', { days }), cls: 'is-soon', isPast: false };
    return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }), cls: '', isPast: false };
  }
  /** "09:11" → "9:11 AM" — same formatting as the Admin Events card. */
  private to12h(time24: string): string {
    const [h, m] = time24.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return time24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  /** "09:11" + "11:12" + "Asia/Kolkata" → "9:11 AM – 11:12 AM (Asia/Kolkata)" */
  formatEventTime(evt: AppEvent): string {
    if (!evt.eventTime) return '';
    let text = this.to12h(evt.eventTime);
    if (evt.eventEndTime) text += ' – ' + this.to12h(evt.eventEndTime);
    if (evt.timezone) text += ` (${evt.timezone})`;
    return text;
  }

  /** Address + Venue/City - Pincode, Country → "12 Main St, City Hall - 600001, India" */
  formatEventAddress(evt: AppEvent): string {
    const parts: string[] = [];
    if (evt.address) parts.push(evt.address);
    const venuePincode = [evt.location, evt.pincode].filter(Boolean).join(' - ');
    if (venuePincode) parts.push(venuePincode);
    if (evt.country) parts.push(evt.country);
    return parts.join(', ');
  }

  // ── card description expand/collapse ──
  toggleDescription(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedDescriptions.update(set => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── image viewer ──
  openImageViewer(images: string[], index = 0): void {
    this.imageViewerImages.set(images);
    this.imageViewerInitialIndex.set(index);
    this.imageViewerOpen.set(true);
  }
  closeImageViewer(): void { this.imageViewerOpen.set(false); }

  /** The whole card is clickable — this is what it navigates to (edit/delete/zoom/links inside it stop propagation so they don't also trigger this). */
  viewEventDetails(evt: AppEvent): void {
    this.router.navigate(['/user/events', evt.id]);
  }

  // ── add / edit modal (form owned by app-event-form-modal) ──
  openAddModal(): void {
    this.editingId.set(null);
    this.showAddModal.set(true);
  }
  openEditModal(evt: AppEvent): void {
    this.editingId.set(evt.id);
    this.showAddModal.set(true);
  }
  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editingId.set(null);
  }

  onEventSaved(evt: AppEvent): void {
    if (evt.status === 'PENDING') {
      // Not visible in the public list until approved — only reflect it
      // locally when the user is already looking at their Pending Approval
      // tab; refresh the badge count either way.
      this.loadMyPendingEventsCount();
      if (this.pageTab() !== 'pending') return;
    }
    const exists = this.events().some(e => e.id === evt.id);
    if (exists) {
      this.events.update(list => list.map(e => e.id === evt.id ? evt : e));
    } else {
      this.events.update(list => [evt, ...list]);
      this.totalItems.update(v => v + 1);
    }
  }

  // ── delete ──
  requestDelete(evt: AppEvent): void { this.eventToDelete.set(evt); }
  cancelDeleteConfirm(): void { this.eventToDelete.set(null); }

  confirmDeleteExecute(): void {
    const evt = this.eventToDelete();
    if (!evt) return;
    this.deleting.set(true);

    this.eventService.deleteEvent(evt.id).subscribe({
      next: () => {
        this.toast.success('user.events.toast.eventDeleted');
        this.eventToDelete.set(null);
        this.deleting.set(false);
        // Reset to a fresh page 1 rather than trying to patch the
        // infinite-scroll list in place — deletes are rare enough that
        // losing scroll position is an acceptable trade for guaranteed
        // consistency with the server.
        this.loadEvents();
      },
      error: () => { this.toast.error('user.events.toast.failedDeleteEvent'); this.deleting.set(false); },
    });
  }
}
