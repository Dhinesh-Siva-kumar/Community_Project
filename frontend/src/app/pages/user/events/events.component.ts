import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild, inject, signal, computed, effect, viewChildren } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subject, map, takeUntil } from 'rxjs';
import { EventService, EventsQueryParams } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { Event as AppEvent, EventCategory, VisibilityType, PaginatedResponse, Country, CountryAddressConfig, Division } from '../../../core/models';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { EventFormModalComponent } from '../../../shared/components/event-form-modal/event-form-modal.component';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';
import { EVENT_CATEGORY_GRADIENT, eventCategoryGradient } from '../../../shared/constants/event-categories';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard';
import { formatEventAddress as formatEventAddressUtil, eventLocationSummary as eventLocationSummaryUtil, eventModeCategorySummary as eventModeCategorySummaryUtil } from '../../../shared/utils/event-location';
import { formatEventTimeRange as formatEventTimeRangeUtil, eventCardDateTimeLabel as eventCardDateTimeLabelUtil } from '../../../shared/utils/event-date-format';
import { GuestGateComponent } from '../../../shared/components/guest-gate/guest-gate.component';

type ModeFilter = 'all' | 'Offline' | 'Online' | 'Hybrid';
/** '' = All Events. Drives the quick filter in the search card — defaults to 'upcoming'. */
type StatusFilter = 'upcoming' | 'completed' | '';

@Component({
  selector: 'app-user-events',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink, ImageViewerComponent, ImageUrlPipe, SearchableSelectComponent, DateInputComponent, EventFormModalComponent, EventDateBadgeComponent, InfiniteScrollDirective, ScrollLockDirective, TranslatePipe, EnumLabelPipe, GuestGateComponent],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the events list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class UserEventsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private translate = inject(TranslateService);
  private eventService = inject(EventService);
  authService          = inject(AuthService);
  private layoutService = inject(LayoutService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private geographyService = inject(GeographyService);
  private destroy$ = new Subject<void>();

  @ViewChild('eventFormModal') eventFormModal?: EventFormModalComponent;

  /** Backs the `user/events` route's `canDeactivate: [unsavedChangesGuard]` — see app.routes.ts. */
  hasUnsavedChanges(): boolean {
    return !!this.eventFormModal?.isDirty();
  }

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
  private countriesRaw: Country[] = [];

  // ── Location filters — Country already above; State/Province/Region ->
  // City cascade underneath it, same shared geography service (country-
  // specific division labels/leaf-division-as-stateId semantics) used by
  // the Add/Edit Event form's own cascade, so a State/City picked here
  // filters on exactly the same `stateId`/`cityId` columns an event was
  // saved with. ──
  filterCountryId  = signal<number | null>(null);
  filterStateId    = signal<number | null>(null);
  filterCityId     = signal<number | null>(null);
  countryConfig    = signal<CountryAddressConfig | null>(null);
  division1Options = signal<Division[]>([]);
  division2Options = signal<Division[]>([]);
  division1Loading = signal(false);
  division2Loading = signal(false);
  division1SelectOptions = computed<SelectOption[]>(() => this.division1Options().map((d) => ({ value: d.id, label: d.name })));
  division2SelectOptions = computed<SelectOption[]>(() => this.division2Options().map((d) => ({ value: d.id, label: d.name })));
  adminLevels = computed(() => this.countryConfig()?.divisionLevels ?? []);
  selectedDivision1Name = signal<string | null>(null);
  selectedDivision2Name = signal<string | null>(null);
  selectedCityOption    = signal<SelectOption | null>(null);
  selectedCityName      = signal<string | null>(null);

  private static readonly REGION_LABEL_KEYS: Record<string, string> = {
    GB: 'components.jobForm.regionLabel.county',
    IN: 'components.jobForm.regionLabel.state',
    DE: 'components.jobForm.regionLabel.state',
    CA: 'components.jobForm.regionLabel.province',
  };
  regionLabelKey = computed<string>(() => {
    const id = this.filterCountryId();
    if (!id) return 'components.jobForm.regionLabel.default';
    const iso2 = this.countriesRaw.find((c) => c.id === id)?.iso2?.toUpperCase();
    return (iso2 && UserEventsComponent.REGION_LABEL_KEYS[iso2]) || 'components.jobForm.regionLabel.fallback';
  });

  private cityNameCache = new Map<number, string>();
  citySearchFn = (query: string): Observable<SelectOption[]> => {
    const countryId  = this.filterCountryId() ?? undefined;
    const divisionId = this.getLeafDivisionId() ?? undefined;
    if (!countryId) return new Observable<SelectOption[]>((sub) => { sub.next([]); sub.complete(); });
    return this.geographyService.searchCities({ divisionId, countryId: divisionId ? undefined : countryId, search: query, page: 1, limit: 20 }).pipe(
      map((res) => {
        res.data.forEach((c) => this.cityNameCache.set(c.id, c.name));
        return res.data.map((c) => ({ value: c.id, label: c.name }));
      }),
    );
  };

  filterDateFrom        = signal('');
  filterDateTo          = signal('');
  activeQuickRange      = signal<'today' | '7d' | '30d' | 'next7d' | 'next30d' | 'thisMonth' | null>(null);
  showAdvancedFilters   = signal(false);

  // ── Visibility filter — opt-in ("show me only Worldwide events"),
  // independent of the automatic country/worldwide access gate applied
  // server-side. Mirrors the Jobs page's filterVisibilityType pill filter. ──
  filterVisibility = signal<'' | VisibilityType>('');

  // ── Category filter — DB-backed (event_categories table). Loads the full
  // list (not active-only): an event using a now-disabled category must
  // stay findable/filterable while it's still live. ──
  categories = signal<EventCategory[]>([]);
  categoryFilterOptions = computed<SelectOption[]>(() =>
    this.categories().map((c) => ({ value: c.name, label: c.name, icon: c.icon })),
  );
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
    if (this.filterStateId()) count++;
    if (this.filterCityId()) count++;
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
    // Guests never load any data here — the template renders a "please
    // register or log in" gate instead of the real events list for them
    // (see GuestGateComponent).
    if (!this.authService.isAuthenticated()) return;

    this.restoreFiltersFromQueryParams();
    this.loadEvents();
    this.loadCountries();
    this.loadCategories();
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
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Filter/search/sort state preservation — the active search/filters
  // are mirrored into this page's own URL query params (see
  // syncFiltersToUrl(), called from applyFilters()), and every event card
  // link carries them forward via [queryParams] so the Event Details page
  // can hand them straight back on its "back to list" breadcrumb. Combined
  // with reading them back out here on init, this means: refreshing the
  // page, using the browser Back button, or following that breadcrumb all
  // land back on the exact same filtered/sorted view — all via the URL,
  // no separate state-management library. ──
  private restoreFiltersFromQueryParams(): void {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('search')) this.searchQuery.set(q.get('search')!);
    const mode = q.get('mode');
    if (mode === 'Offline' || mode === 'Online' || mode === 'Hybrid') this.modeFilter.set(mode);
    if (q.get('category')) this.filterCategory.set(q.get('category')!);
    const vis = q.get('visibility');
    if (vis === 'COUNTRY' || vis === 'WORLDWIDE') this.filterVisibility.set(vis);
    const status = q.get('status');
    if (status === 'upcoming' || status === 'completed' || status === '') this.filterStatus.set(status);
    if (q.get('dateFrom')) this.filterDateFrom.set(q.get('dateFrom')!);
    if (q.get('dateTo')) this.filterDateTo.set(q.get('dateTo')!);
    const range = q.get('range');
    if (range === 'today' || range === '7d' || range === '30d' || range === 'next7d' || range === 'next30d' || range === 'thisMonth') this.activeQuickRange.set(range);
    // countryId/stateId/cityId are restored once loadCountries() resolves
    // (the cascade needs the country list/division data first) — see
    // restoreLocationFromQueryParams() below.
  }

  /** Reflects the current search/filter state into the URL — call after any filter change. */
  private syncFiltersToUrl(): void {
    const params: Record<string, string | null> = {
      search: this.searchQuery() || null,
      mode: this.modeFilter() !== 'all' ? this.modeFilter() : null,
      category: this.filterCategory() || null,
      countryId: this.filterCountryId() ? String(this.filterCountryId()) : null,
      stateId: this.filterStateId() ? String(this.filterStateId()) : null,
      cityId: this.filterCityId() ? String(this.filterCityId()) : null,
      visibility: this.filterVisibility() || null,
      status: this.filterStatus() !== 'upcoming' ? this.filterStatus() : null,
      dateFrom: this.filterDateFrom() || null,
      dateTo: this.filterDateTo() || null,
      range: this.activeQuickRange() || null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Everything the Event Details page's breadcrumb needs to carry back to this exact filtered view. */
  currentFilterQueryParams(): Record<string, string> {
    const out: Record<string, string> = {};
    this.route.snapshot.queryParamMap.keys.forEach((k) => {
      if (k === 'eventId' || k === 'openAdd') return;
      const v = this.route.snapshot.queryParamMap.get(k);
      if (v) out[k] = v;
    });
    return out;
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res: any) => {
        const list: Country[] = res.data ?? res ?? [];
        this.countriesRaw = list;
        this.filterCountryOptions = list.map((c: Country) => ({ value: c.id, label: c.name }));
        this.restoreLocationFromQueryParams();
      },
      error: () => {},
    });
  }

  /** Resolves countryId/stateId/cityId from the URL once the country list is loaded, rebuilding the division cascade. */
  private restoreLocationFromQueryParams(): void {
    const q = this.route.snapshot.queryParamMap;
    const countryId = q.get('countryId') ? Number(q.get('countryId')) : null;
    if (!countryId) return;
    const country = this.countriesRaw.find((c) => c.id === countryId);
    if (!country) return;
    this.filterCountryId.set(countryId);
    this.filterCountry.set(country.name);
    const stateId = q.get('stateId') ? Number(q.get('stateId')) : null;
    const cityId  = q.get('cityId')  ? Number(q.get('cityId'))  : null;

    this.geographyService.getCountryConfig(countryId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        if (config.divisionLevels.length === 0) return;
        this.division1Loading.set(true);
        this.geographyService.getDivisions(countryId).pipe(takeUntil(this.destroy$)).subscribe({
          next: (divisions) => {
            this.division1Options.set(divisions);
            this.division1Loading.set(false);
            if (!stateId) return;
            // The saved leaf state could be a level-1 or level-2 division —
            // try level 1 first, then search level 2 under each level-1
            // parent until found (mirrors the form's leaf-id semantics).
            const atLevel1 = divisions.find((d) => d.id === stateId);
            if (atLevel1) {
              this.filterStateId.set(stateId);
              this.selectedDivision1Name.set(atLevel1.name);
              if (cityId) this.resolveFilterCity(cityId);
              return;
            }
            if (config.divisionLevels.length < 2) return;
            this.division2Loading.set(true);
            // Fall back: fetch children for each level-1 division until the stateId is found.
            const tryNext = (idx: number): void => {
              if (idx >= divisions.length) { this.division2Loading.set(false); return; }
              this.geographyService.getDivisions(countryId, divisions[idx].id).pipe(takeUntil(this.destroy$)).subscribe({
                next: (children) => {
                  const match = children.find((d) => d.id === stateId);
                  if (match) {
                    this.division2Options.set(children);
                    this.filterStateId.set(stateId);
                    this.selectedDivision1Name.set(divisions[idx].name);
                    this.selectedDivision2Name.set(match.name);
                    this.division2Loading.set(false);
                    if (cityId) this.resolveFilterCity(cityId);
                  } else {
                    tryNext(idx + 1);
                  }
                },
                error: () => tryNext(idx + 1),
              });
            };
            tryNext(0);
          },
          error: () => this.division1Loading.set(false),
        });
      },
      error: () => {},
    });
  }

  /** City name isn't strictly needed for filtering (the id alone drives the query) — resolve it so the select shows a label instead of blank. */
  private resolveFilterCity(cityId: number): void {
    this.geographyService.searchCities({ divisionId: this.getLeafDivisionId() ?? undefined, countryId: this.filterCountryId() ?? undefined, search: '', page: 1, limit: 20 }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const match = res.data.find((c) => c.id === cityId);
        this.filterCityId.set(cityId);
        this.selectedCityOption.set({ value: cityId, label: match?.name ?? String(cityId) });
        this.selectedCityName.set(match?.name ?? null);
      },
    });
  }

  loadCategories(): void {
    this.eventService.getCategories().subscribe({
      next: (data) => this.categories.set(data),
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
      stateId: this.filterStateId() ?? undefined,
      cityId: this.filterCityId() ?? undefined,
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

  applyFilters(): void { this.loadEvents(); this.syncFiltersToUrl(); }

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

  onFilterCountryChange(id: number | string | null): void {
    const countryId = id ? Number(id) : null;
    this.filterCountryId.set(countryId);
    this.filterCountry.set(countryId ? (this.countriesRaw.find((c) => c.id === countryId)?.name ?? null) : null);
    this.resetDivisionState();
    if (!countryId) { this.applyFilters(); return; }
    this.geographyService.getCountryConfig(countryId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        if (config.divisionLevels.length === 0) return;
        this.division1Loading.set(true);
        this.geographyService.getDivisions(countryId).pipe(takeUntil(this.destroy$)).subscribe({
          next: (divisions) => { this.division1Options.set(divisions); this.division1Loading.set(false); },
          error: () => this.division1Loading.set(false),
        });
      },
      error: () => {},
    });
    this.applyFilters();
  }

  private getLeafDivisionId(): number | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) return this.filterStateId();
    if (levels === 1) return this.filterStateId();
    return null;
  }

  private resetDivisionState(): void {
    this.countryConfig.set(null);
    this.division1Options.set([]);
    this.division2Options.set([]);
    this.selectedDivision1Name.set(null);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);
    this.filterStateId.set(null);
    this.filterCityId.set(null);
  }

  onDivision1Change(id: number | string | null): void {
    const divId = id ? Number(id) : null;
    this.division2Options.set([]);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);
    this.filterCityId.set(null);
    this.filterStateId.set(divId);
    this.selectedDivision1Name.set(divId ? (this.division1Options().find((d) => d.id === divId)?.name ?? null) : null);
    if (divId && this.adminLevels().length >= 2) {
      this.division2Loading.set(true);
      this.geographyService.getDivisions(this.filterCountryId()!, divId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (divisions) => { this.division2Options.set(divisions); this.division2Loading.set(false); },
        error: () => this.division2Loading.set(false),
      });
    }
    this.applyFilters();
  }

  onDivision2Change(id: number | string | null): void {
    const divId = id ? Number(id) : null;
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);
    this.filterCityId.set(null);
    this.filterStateId.set(divId);
    this.selectedDivision2Name.set(divId ? (this.division2Options().find((d) => d.id === divId)?.name ?? null) : null);
    this.applyFilters();
  }

  onFilterCityChange(cityId: any): void {
    const id = cityId ? Number(cityId) : null;
    this.filterCityId.set(id);
    const name = id ? (this.cityNameCache.get(id) ?? null) : null;
    this.selectedCityName.set(name);
    this.selectedCityOption.set(id ? { value: id, label: name ?? '' } : null);
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

  /** Fills From/To Date with a preset range (mirrors the Business list page's quick date presets).
   * 'today'/'next7d'/'next30d'/'thisMonth' look forward from today (useful
   * alongside the Upcoming quick filter); '7d'/'30d' — kept for backward
   * compatibility with any saved/shared filter links — look back. */
  applyQuickDatePreset(preset: 'today' | '7d' | '30d' | 'next7d' | 'next30d' | 'thisMonth'): void {
    const today = new Date();
    const todayStr = this.toInputDate(today);

    if (preset === 'today') {
      this.filterDateFrom.set(todayStr);
      this.filterDateTo.set(todayStr);
    } else if (preset === '7d' || preset === '30d') {
      const fromDate = new Date(today);
      fromDate.setDate(today.getDate() - (preset === '7d' ? 6 : 29));
      this.filterDateFrom.set(this.toInputDate(fromDate));
      this.filterDateTo.set(todayStr);
    } else if (preset === 'next7d' || preset === 'next30d') {
      const toDate = new Date(today);
      toDate.setDate(today.getDate() + (preset === 'next7d' ? 6 : 29));
      this.filterDateFrom.set(todayStr);
      this.filterDateTo.set(this.toInputDate(toDate));
    } else if (preset === 'thisMonth') {
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      this.filterDateFrom.set(todayStr);
      this.filterDateTo.set(this.toInputDate(monthEnd));
    }
    this.activeQuickRange.set(preset);
    this.applyFilters();
  }

  private toInputDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  removeFilter(key: 'mode' | 'country' | 'state' | 'city' | 'visibility' | 'category' | 'dateFrom' | 'dateTo'): void {
    switch (key) {
      case 'mode':       this.modeFilter.set('all'); break;
      case 'country':    this.filterCountryId.set(null); this.filterCountry.set(null); this.resetDivisionState(); break;
      case 'state':      this.filterStateId.set(null); this.selectedDivision1Name.set(null); this.selectedDivision2Name.set(null); this.division2Options.set([]); this.filterCityId.set(null); this.selectedCityOption.set(null); break;
      case 'city':       this.filterCityId.set(null); this.selectedCityOption.set(null); this.selectedCityName.set(null); break;
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
    this.filterCountryId.set(null);
    this.filterCountry.set(null);
    this.resetDivisionState();
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
  categoryIcon(cat?: string): string { return this.categories().find((c) => c.name === cat)?.icon ?? 'bi-calendar-event'; }
  categoryGradient(cat?: string): string { return eventCategoryGradient(cat); }

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
    this.router.navigate(['/user/events', evt.id], { queryParams: this.currentFilterQueryParams() });
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
