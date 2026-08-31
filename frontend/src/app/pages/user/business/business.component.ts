import { Component, OnInit, OnDestroy, HostListener, ElementRef, WritableSignal, inject, signal, computed, effect, viewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Business, BusinessCategory, PaginatedResponse, Country } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { BusinessFormModalComponent } from '../../../shared/components/business-form-modal/business-form-modal.component';
import { BusinessDeleteModalComponent } from '../../../shared/components/business-delete-modal/business-delete-modal.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { TranslatePipe } from '@ngx-translate/core';

type ViewState = 'categories' | 'list' | 'detail';

/**
 * Shape pushed to `history.pushState` when opening a business's Detail view,
 * so the browser Back button returns to the list instead of leaving the
 * page — mirrors the Admin Business page's popstate-driven navigation.
 */
interface BusinessNavState {
  view: 'detail';
  business: Business;
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Component({
  selector: 'app-user-business',
  standalone: true,
  imports: [DateInputComponent, CommonModule, FormsModule, SearchableSelectComponent, ImageUrlPipe, InfiniteScrollDirective, BusinessFormModalComponent, BusinessDeleteModalComponent, TranslatePipe],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the business list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class UserBusinessComponent implements OnInit, OnDestroy {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private layoutService     = inject(LayoutService);
  private toast             = inject(ToastService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  // ── View state ──────────────────────────────────────────────
  currentView      = signal<ViewState>('list');
  /** 'list' = Business List view, 'categories' = Category browse view */
  businessView     = signal<'list' | 'categories'>('list');
  /** 'all' = public browse (List/Categories toggle above), 'pending' = the caller's own submissions across every status */
  pageTab          = signal<'all' | 'pending'>('all');
  myPendingBusinessCount = signal(0);

  // ── Sliding active-pill indicators (JS-measured, same approach as the
  // User Community page's .uc-tab-indicator) for both tab rows below — the
  // All/Pending row and the List/Category row. A fixed 50%/translateX(100%)
  // ignores the row's flex gap and bleeds the pill's border onto the
  // neighbouring tab, so position/width are read from the real button box
  // instead. ──
  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  tabIndicatorLeft  = signal(0);
  tabIndicatorWidth = signal(0);
  tabIndicatorReady = signal(false);

  private viewTabButtons = viewChildren<ElementRef<HTMLButtonElement>>('viewTabBtn');
  viewTabIndicatorLeft  = signal(0);
  viewTabIndicatorWidth = signal(0);
  viewTabIndicatorReady = signal(false);

  // ── Master data ─────────────────────────────────────────────
  categories       = signal<BusinessCategory[]>([]);
  /** Grid view — numbered-page slice of the current filtered/sorted results. */
  businesses       = signal<Business[]>([]);
  // List view — the full filtered/sorted results, lazily revealed 10 at a
  // time as the user scrolls (see visibleBusinesses / loadMoreBusinesses),
  // instead of Grid view's numbered pagination.
  allFilteredBusinesses = signal<Business[]>([]);
  readonly BUSINESS_BATCH_SIZE = 10;
  visibleBusinessCount  = signal(this.BUSINESS_BATCH_SIZE);
  visibleBusinesses     = computed(() => this.allFilteredBusinesses().slice(0, this.visibleBusinessCount()));
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);
  showDeleteModal = signal(false);
  businessToDelete = signal<Business | null>(null);
  /** id of the card whose owner action menu (Edit/Delete) is currently open — only one at a time. */
  openMenuId = signal<string | null>(null);
  loading          = signal(true);
  currentPage      = signal(1);
  totalPages       = signal(1);
  totalItems       = signal(0);
  activeImageIndex = signal(0);
  // Image lightbox — mirrors the Admin Business page's implementation.
  lightboxOpen   = signal(false);
  lightboxImages = signal<string[]>([]);

  // ── Geolocation ─────────────────────────────────────────────
  userLatitude     = signal<number | null>(null);
  userLongitude    = signal<number | null>(null);
  geoDenied        = signal(false);
  geoLoading       = signal(true);

  // ── Distance filter bounds — user-adjustable radius (km), shown as a
  // "normal" filter alongside search rather than tucked in Advanced Filters. ──
  readonly DISTANCE_MIN_KM  = 1;
  readonly DISTANCE_MAX_KM  = 500;
  readonly DISTANCE_DEFAULT_M = 5000;

  // ── Filters — panel replicated from the Admin Business list page's
  // .jb-filter-panel (search + collapsible Advanced Filters), with Status
  // dropped (public users only ever see active businesses) and Distance +
  // Category added since those are specific to this consumer-facing page. ──
  filterSearch        = signal('');
  filterCountry       = signal<string | null>(null);
  filterCountryOptions: SelectOption[] = [];
  filterPincode       = signal('');
  filterOpeningHours  = signal<string | null>(null);
  filterOpeningHoursOptions: SelectOption[] = [
    { value: '9-5',  label: 'user.business.hoursOption.nineToFive' },
    { value: '24/7', label: 'user.business.hoursOption.allDay' },
  ];
  filterDateFrom      = signal('');
  filterDateTo        = signal('');
  activeQuickRange    = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters = signal(false);
  /** Distance in meters: null = no filter (All), otherwise a user-adjustable radius (default 5km). */
  filterDistance      = signal<number | null>(this.DISTANCE_DEFAULT_M);
  /** Distance in whole kilometers, for the adjustable distance input — derived from filterDistance. */
  filterDistanceKm    = computed(() => this.filterDistance() === null ? null : Math.round(this.filterDistance()! / 1000));
  /** Selected category ID for filter dropdown (null/empty = all) */
  filterCategoryId    = signal<string | null>(null);

  /** Category options for filter dropdown (includes "All Categories") */
  categorySelectOptions = computed<SelectOption[]>(() => {
    const cats = this.categories().map(c => ({ value: c.id, label: c.name }));
    return [{ value: '', label: 'user.business.filter.allCategories' }, ...cats];
  });

  /** Label of the currently selected category filter, for the active-filter chip. */
  filterCategoryLabel = computed<string>(() => {
    const id = this.filterCategoryId();
    if (!id) return '';
    return this.categorySelectOptions().find(o => o.value === id)?.label ?? '';
  });

  hasActiveFilters = computed(() =>
    !!(this.filterSearch() || (this.filterCountry() !== this.getDefaultCountry()) || this.filterPincode() || this.filterOpeningHours()
      || this.filterDateFrom() || this.filterDateTo() || this.filterCategoryId()
      || this.filterDistance() !== this.DISTANCE_DEFAULT_M)
  );

  // Distance now lives in the "normal" filter row (next to search), not
  // Advanced Filters, so it's excluded from this badge count.
  activeFilterCount = computed(() => {
    let count = 0;
    // The country filter defaults to the signed-in user's own country, so
    // only count/chip it when it differs from that default.
    if (this.filterCountry() !== this.getDefaultCountry()) count++;
    if (this.filterPincode()) count++;
    if (this.filterOpeningHours()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    if (this.filterCategoryId()) count++;
    return count;
  });

  totalBusinesses  = computed(() => this.categories().reduce((s,c) => s + (c._count?.businesses ?? 0), 0));
  totalCategoriesCount = computed(() => this.categories().length);

  // ── Category view (legacy) controls ─────────────────────────
  catSearch   = signal('');
  catSortBy   = signal<'name'|'count'|'newest'>('name');
  catViewMode = signal<'grid'|'list'>('grid');
  bizViewMode = signal<'grid'|'list'>('grid');

  /** Sort options for the Category view's sort dropdown — same app-searchable-select used everywhere else on this page. */
  readonly catSortOptions: SelectOption[] = [
    { value: 'name',   label: 'user.business.sortOption.name' },
    { value: 'count',  label: 'user.business.sortOption.count' },
    { value: 'newest', label: 'user.business.sortOption.newest' },
  ];

  filteredCategories = computed(() => {
    const q = this.catSearch().toLowerCase();
    let list = q ? this.categories().filter(c => c.name.toLowerCase().includes(q)) : this.categories();
    switch (this.catSortBy()) {
      case 'count':  list = [...list].sort((a,b) => (b._count?.businesses??0) - (a._count?.businesses??0)); break;
      case 'newest': list = [...list].sort((a,b) => new Date((b as any).created_at ?? b.createdAt ?? 0).getTime() - new Date((a as any).created_at ?? a.createdAt ?? 0).getTime()); break;
      default:       list = [...list].sort((a,b) => a.name.localeCompare(b.name));
    }
    return list;
  });

  // ── Lazy-render categories in batches of 10 as the user scrolls, instead
  // of rendering the full (already-fetched) list at once — see
  // loadMoreCategories() / InfiniteScrollDirective on the sentinel below. ──
  readonly CATEGORY_BATCH_SIZE = 10;
  visibleCategoryCount = signal(this.CATEGORY_BATCH_SIZE);
  visibleCategories = computed(() => this.filteredCategories().slice(0, this.visibleCategoryCount()));

  loadMoreCategories(): void {
    this.visibleCategoryCount.update(n =>
      Math.min(n + this.CATEGORY_BATCH_SIZE, this.filteredCategories().length));
  }

  // ── Add/Edit Business modal — the form itself lives in the shared
  // app-business-form-modal component; this page only tracks whether it's
  // open and, for edit, which business it's editing. ──
  showBusinessModal = signal(false);
  editBusinessId    = signal<string | null>(null);

  private readonly ACCENT_MAP: Record<string, string> = {
    'bi-fork-knife':'orange','bi-cup-hot':'brown','bi-building':'purple',
    'bi-capsule':'red','bi-stethoscope':'red','bi-hospital':'red','bi-hospital-fill':'red','bi-activity':'red',
    'bi-cart':'indigo','bi-bag':'indigo','bi-handbag':'indigo',
    'bi-bank':'blue','bi-credit-card':'blue','bi-coin':'blue','bi-cash-stack':'blue',
    'bi-mortarboard':'cyan','bi-journal':'cyan','bi-book':'cyan',
    'bi-scissors':'pink','bi-flower1':'pink','bi-gem':'pink',
    'bi-house-door':'green','bi-house':'green','bi-house-add':'green',
    'bi-car-front':'slate','bi-truck':'slate','bi-fuel-pump':'slate','bi-tools':'slate',
    'bi-film':'violet','bi-ticket':'violet','bi-calendar-event':'violet',
    'bi-beer':'amber','bi-cup-straw':'amber','bi-cup':'amber','bi-cake':'amber','bi-ice-cream':'amber',
    'bi-shop':'teal','bi-shop-window':'teal','bi-basket':'teal',
    'bi-airplane':'navy','bi-globe':'navy','bi-shield-check':'navy','bi-laptop':'purple',
  };

  getCategoryAccent(icon?: string): string { return this.ACCENT_MAP[icon ?? ''] ?? 'orange'; }
  getCategoryIcon(icon?: string): string   { return icon || 'bi-shop'; }

  constructor() {
    // Auto-refresh whenever any filter changes
    effect(() => {
      const _search = this.filterSearch();
      const _country = this.filterCountry();
      const _pincode = this.filterPincode();
      const _hours = this.filterOpeningHours();
      const _dateFrom = this.filterDateFrom();
      const _dateTo = this.filterDateTo();
      const _dist = this.filterDistance();
      const _catId = this.filterCategoryId();
      const _page = this.currentPage();
      // Guard on pageTab() too — otherwise returning from a business's detail
      // view (which flips currentView back to 'list' via popstate) silently
      // overwrote the "Pending Approval" tab's list with the full "All"
      // businesses fetch, since this effect fires on any currentView change.
      if (this.currentView() === 'list' && this.pageTab() === 'all' && !this.geoLoading()) {
        this.loadNearbyBusinesses();
      }
    });

    // Restart the lazy-loaded category batch whenever the search/sort
    // criteria change, so pagination doesn't skip past newly-matching
    // categories that would otherwise sort ahead of the current cutoff.
    effect(() => {
      this.catSearch();
      this.catSortBy();
      this.visibleCategoryCount.set(this.CATEGORY_BATCH_SIZE);
    });

    // Slide each pill under whichever tab is active in its row — recomputed
    // whenever the active tab changes or the buttons first mount.
    effect(() => {
      this.tabButtons();
      this.pageTab();
      this.updateIndicator(this.tabButtons(), this.pageTab() === 'all' ? 0 : 1,
        this.tabIndicatorLeft, this.tabIndicatorWidth, this.tabIndicatorReady);
    });
    effect(() => {
      this.viewTabButtons();
      this.businessView();
      this.updateIndicator(this.viewTabButtons(), this.businessView() === 'list' ? 0 : 1,
        this.viewTabIndicatorLeft, this.viewTabIndicatorWidth, this.viewTabIndicatorReady);
    });
  }

  @HostListener('window:resize')
  onTabRowResize(): void {
    this.updateIndicator(this.tabButtons(), this.pageTab() === 'all' ? 0 : 1,
      this.tabIndicatorLeft, this.tabIndicatorWidth, this.tabIndicatorReady);
    this.updateIndicator(this.viewTabButtons(), this.businessView() === 'list' ? 0 : 1,
      this.viewTabIndicatorLeft, this.viewTabIndicatorWidth, this.viewTabIndicatorReady);
  }

  private updateIndicator(
    buttons: readonly ElementRef<HTMLButtonElement>[],
    activeIndex: number,
    leftSig: WritableSignal<number>,
    widthSig: WritableSignal<number>,
    readySig: WritableSignal<boolean>,
  ): void {
    const btn = buttons[activeIndex]?.nativeElement;
    if (!btn) return;
    leftSig.set(btn.offsetLeft);
    widthSig.set(btn.offsetWidth);
    readySig.set(true);
  }

  ngOnInit(): void {
    // Default the country filter to the signed-in user's own country —
    // other countries' businesses only show once the user explicitly
    // picks one in the filter. Set before the first fetch so it's already
    // applied (the constructor's effect() won't actually fetch until
    // geoLoading resolves, so there's no extra/duplicate request).
    this.filterCountry.set(this.getDefaultCountry());
    this.loadCategories();
    this.loadCountries();
    this.requestGeolocation();
    this.loadMyPendingBusinessCount();

    // Deep-link support — e.g. the Profile page's "My Businesses" tab
    // navigates here with ?businessId=xxx to jump straight to that
    // business's detail view.
    this.route.queryParams.subscribe(params => {
      const businessId = params['businessId'];
      if (businessId) this.openBusinessFromQueryParam(businessId);
    });
  }

  /** The target business may not be part of the currently loaded/filtered
   * list — fetched directly rather than looked up in businesses(). */
  private openBusinessFromQueryParam(id: string): void {
    this.svc.getBusiness(id).subscribe({
      next: biz => this.loadBusinessDetail(biz),
      error: () => this.toast.error('user.business.toast.businessNotFoundNoLonger'),
    });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { businessId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnDestroy(): void {
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  /** The signed-in user's own country — the default the country filter starts/resets to. */
  getDefaultCountry(): string | null {
    return this.authService.currentUser()?.country || null;
  }

  private requestGeolocation(): void {
    this.geoLoading.set(true);
    if (!navigator.geolocation) {
      this.geoDenied.set(true);
      this.geoLoading.set(false);
      this.loadNearbyBusinesses();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userLatitude.set(pos.coords.latitude);
        this.userLongitude.set(pos.coords.longitude);
        this.geoDenied.set(false);
        this.geoLoading.set(false);
        this.loadNearbyBusinesses();
      },
      () => {
        this.geoDenied.set(true);
        this.geoLoading.set(false);
        this.loadNearbyBusinesses();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res: any) => {
        this.filterCountryOptions = (res.data ?? res ?? []).map((c: Country) => ({
          value: c.name,
          label: c.name,
        }));
      },
      error: () => {},
    });
  }

  loadCategories(): void {
    this.loading.set(true);
    this.svc.getCategories().subscribe({
      next: data => { this.categories.set(data); this.loading.set(false); },
      error: () => { this.toast.error('user.business.toast.failedLoadCategories'); this.loading.set(false); },
    });
  }

  /** Main method to load businesses with filters applied (client-side distance) */
  loadNearbyBusinesses(): void {
    this.currentView.set('list');
    this.businessView.set('list');
    this.loading.set(true);

    // Build API params
    const params: Record<string, any> = { page: 1, limit: 100 };

    // Category filter (single-select dropdown)
    const catId = this.filterCategoryId();
    if (catId) {
      params['categoryId'] = catId;
    }

    // Search text
    if (this.filterSearch()) {
      params['search'] = this.filterSearch();
    }

    // Country filter
    if (this.filterCountry()) {
      params['country'] = this.filterCountry();
    }

    // Advanced filters — Pincode, Opening Hours, Date Added range
    if (this.filterPincode()) {
      params['pincode'] = this.filterPincode();
    }
    if (this.filterOpeningHours()) {
      params['openingHours'] = this.filterOpeningHours();
    }
    if (this.filterDateFrom()) {
      params['dateFrom'] = this.filterDateFrom();
    }
    if (this.filterDateTo()) {
      params['dateTo'] = this.filterDateTo();
    }

    this.svc.getBusinesses(params).subscribe({
      next: (res: PaginatedResponse<Business>) => {
        let filtered = res.data;

        // Apply client-side distance filter
        const lat = this.userLatitude();
        const lng = this.userLongitude();
        const dist = this.filterDistance(); // in meters

        if (lat !== null && lng !== null && dist !== null) {
          const distKm = dist / 1000;
          filtered = filtered
            .map(b => ({
              ...b,
              _distanceKm: (b.latitude != null && b.longitude != null)
                ? haversineKm(lat, lng, b.latitude, b.longitude)
                : Infinity,
            }))
            .filter(b => (b as any)._distanceKm <= distKm)
            .sort((a, b) => ((a as any)._distanceKm || Infinity) - ((b as any)._distanceKm || Infinity));
        } else {
          // No distance filter — sort by newest first
          filtered = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        // Grid view — numbered-page slice.
        const limit = 20;
        const page = this.currentPage();
        const start = (page - 1) * limit;
        const paged = filtered.slice(start, start + limit);
        const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

        this.businesses.set(paged);
        this.totalItems.set(filtered.length);
        this.totalPages.set(totalPages);

        // List view — full set, lazily revealed from scratch on every fresh fetch.
        this.allFilteredBusinesses.set(filtered);
        this.visibleBusinessCount.set(this.BUSINESS_BATCH_SIZE);

        this.loading.set(false);
      },
      error: () => {
        this.toast.error('user.business.toast.failedLoadBusinesses');
        this.loading.set(false);
      },
    });
  }

  /** Load businesses for a specific category (from category view click) */
  loadBusinessesByCategory(category: BusinessCategory): void {
    this.selectedCategory.set(category);
    this.filterCategoryId.set(category.id);
    this.currentView.set('list');
    this.businessView.set('list');
    this.currentPage.set(1);
    // The effect() will trigger loadNearbyBusinesses automatically
  }

  // Legacy method kept for backward compat — delegates to new system
  loadBusinesses(category: BusinessCategory, resetPage = false): void {
    this.loadBusinessesByCategory(category);
  }

  /** Handle category filter dropdown change */
  onCategoryFilterChange(value: string | number | null): void {
    this.filterCategoryId.set(value ? String(value) : null);
    this.currentPage.set(1);
  }

  /** Set distance filter (meters) */
  setDistance(distance: number | null): void {
    this.filterDistance.set(distance);
    this.currentPage.set(1);
  }

  /** Handle direct typing/editing of the distance (km) input. */
  onDistanceKmChange(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!raw || Number.isNaN(raw)) return;
    const clamped = Math.min(this.DISTANCE_MAX_KM, Math.max(this.DISTANCE_MIN_KM, Math.round(raw)));
    this.setDistance(clamped * 1000);
  }

  /** Nudge the distance (km) up/down via the stepper buttons. */
  adjustDistanceKm(delta: number): void {
    const current = this.filterDistanceKm() ?? this.DISTANCE_DEFAULT_M / 1000;
    const next = Math.min(this.DISTANCE_MAX_KM, Math.max(this.DISTANCE_MIN_KM, current + delta));
    this.setDistance(next * 1000);
  }

  /** Toggle between the adjustable radius and "All" (no distance cap). */
  toggleDistanceAll(): void {
    this.setDistance(this.filterDistance() === null ? this.DISTANCE_DEFAULT_M : null);
  }

  /** Switch view between Business List and Category View */
  setPageTab(tab: 'all' | 'pending'): void {
    if (this.pageTab() === tab) return;
    this.pageTab.set(tab);
    this.currentPage.set(1);
    if (tab === 'pending') {
      this.loadMyBusinesses();
    } else {
      this.switchView(this.businessView());
    }
  }

  /** "Pending Approval" tab — the caller's own businesses still awaiting admin
   * action: freshly submitted (PENDING) or kicked back for more info (NEEDS_INFO). */
  loadMyBusinesses(): void {
    this.currentView.set('list');
    this.businessView.set('list');
    this.loading.set(true);
    this.svc.getMyBusinesses({ page: 1, limit: 100, approvalStatus: ['PENDING', 'NEEDS_INFO'] }).subscribe({
      next: (res: PaginatedResponse<Business>) => {
        this.businesses.set(res.data);
        this.allFilteredBusinesses.set(res.data);
        this.visibleBusinessCount.set(this.BUSINESS_BATCH_SIZE);
        this.totalItems.set(res.total);
        this.totalPages.set(1);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('user.business.toast.failedLoadBusinesses2');
        this.loading.set(false);
      },
    });
  }

  loadMyPendingBusinessCount(): void {
    this.svc.getMyBusinesses({ page: 1, limit: 1, approvalStatus: ['PENDING', 'NEEDS_INFO'] }).subscribe({
      next: (res: PaginatedResponse<Business>) => this.myPendingBusinessCount.set(res.total),
      error: () => {},
    });
  }

  switchView(view: 'list' | 'categories'): void {
    // Business List / Category View are the public "All" browse's own
    // sub-tabs — the List/Category switcher and the grid/list toggle stay
    // visible on the "Pending Approval" tab too now (rather than being
    // hidden there), so picking either here means leaving "my submissions"
    // and going back to the public browse.
    if (this.pageTab() === 'pending') this.pageTab.set('all');
    this.businessView.set(view);
    this.currentView.set(view === 'categories' ? 'categories' : 'list');
    if (view === 'list') {
      // Explicitly choosing the flat "Business List" tab (as opposed to
      // drilling into it via a category) — clear any category drilled into
      // earlier so the Detail page's breadcrumb correctly shows "Business
      // List" as the entry point, not a stale "Categories" context.
      this.selectedCategory.set(null);
      this.currentPage.set(1);
      this.loadNearbyBusinesses();
    } else {
      // Fresh browse each time the Categories tab is (re-)entered.
      this.visibleCategoryCount.set(this.CATEGORY_BATCH_SIZE);
    }
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadNearbyBusinesses();
  }

  clearFilters(): void {
    this.filterSearch.set('');
    // Resets to the same default the page loads with (the user's own
    // country), not "all countries" — see removeFilter('country') for the
    // explicit "show all countries" action via the chip's remove button.
    this.filterCountry.set(this.getDefaultCountry());
    this.filterPincode.set('');
    this.filterOpeningHours.set(null);
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.showAdvancedFilters.set(false);
    this.filterDistance.set(this.DISTANCE_DEFAULT_M);
    this.filterCategoryId.set(null);
    this.currentPage.set(1);
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

  onFilterOpeningHoursChange(value: string | null): void {
    this.filterOpeningHours.set(value);
    this.currentPage.set(1);
  }

  onFilterDateFromChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set(value);
    this.currentPage.set(1);
  }

  onFilterDateToChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set(value);
    this.currentPage.set(1);
  }

  /** Fills From/To Date with a preset range (mirrors the Admin Business list page's quick date presets). */
  applyQuickDatePreset(preset: 'today' | '7d' | '30d'): void {
    const today = new Date();
    const to = this.toInputDate(today);

    if (preset === 'today') {
      this.filterDateFrom.set(to);
      this.filterDateTo.set(to);
      this.activeQuickRange.set('today');
      this.currentPage.set(1);
      return;
    }

    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - (preset === '7d' ? 6 : 29));
    this.filterDateFrom.set(this.toInputDate(fromDate));
    this.filterDateTo.set(to);
    this.activeQuickRange.set(preset);
    this.currentPage.set(1);
  }

  private toInputDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  removeFilter(filterKey: 'search' | 'country' | 'pincode' | 'hours' | 'dateFrom' | 'dateTo' | 'category'): void {
    switch (filterKey) {
      case 'search':   this.filterSearch.set(''); break;
      case 'country':  this.filterCountry.set(null); break;
      case 'pincode':  this.filterPincode.set(''); break;
      case 'hours':    this.filterOpeningHours.set(null); break;
      case 'dateFrom': this.filterDateFrom.set(''); break;
      case 'dateTo':   this.filterDateTo.set(''); break;
      case 'category': this.filterCategoryId.set(null); break;
    }
    if (filterKey === 'dateFrom' || filterKey === 'dateTo') this.activeQuickRange.set(null);
    this.currentPage.set(1);
  }

  loadBusinessDetail(biz: Business): void {
    this.selectedBusiness.set(biz);
    this.activeImageIndex.set(0);
    this.currentView.set('detail');
    // Pushed so the physical browser Back button returns to the list
    // instead of leaving the page — mirrors the Admin Business page.
    history.pushState({ view: 'detail', business: biz } satisfies BusinessNavState, '');
    this.scrollToTop();
  }

  /** Browser Back/Forward — mirrors the Admin Business page's popstate handling. */
  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    this.applyHistoryState((event.state ?? null) as BusinessNavState | null);
  }

  private applyHistoryState(state: BusinessNavState | null): void {
    this.scrollToTop();
    if (state?.view === 'detail' && state.business) {
      this.selectedBusiness.set(state.business);
      this.activeImageIndex.set(0);
      this.currentView.set('detail');
      return;
    }
    // The baseline entry from before any business was opened (or any other
    // state) — back to the list, whatever it was filtered/scoped to.
    this.selectedBusiness.set(null);
    if (this.currentView() === 'detail') this.currentView.set('list');
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // "Categories" always jumps straight to the Categories tab regardless of
  // how the current business was reached (the flat Business List or a
  // category drill-down), so — unlike goToList() below — it's a direct
  // jump rather than a history pop.
  goToCategories(): void {
    this.currentView.set('categories');
    this.businessView.set('categories');
    this.selectedCategory.set(null);
    this.businesses.set([]);
    this.currentPage.set(1);
    this.filterCategoryId.set(null);
    this.filterSearch.set('');
    this.filterCountry.set(this.getDefaultCountry());
    this.filterDistance.set(this.DISTANCE_DEFAULT_M);
  }

  // Steps back through browser history rather than jumping straight to the
  // list, so the physical Back button lands here the same way — mirrors
  // the Admin Business page's goToList().
  goToList(): void {
    if (this.currentView() === 'detail') history.go(-1);
  }

  // Image lightbox — mirrors the Admin Business page's openImagePreview /
  // closeImagePreview / nextPreviewImage / prevPreviewImage / getActivePreviewImage.
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

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
  }

  /** List view's infinite scroll — reveals the next 10 already-fetched businesses. */
  loadMoreBusinesses(): void {
    this.visibleBusinessCount.update(n =>
      Math.min(n + this.BUSINESS_BATCH_SIZE, this.allFilteredBusinesses().length));
  }

  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let start = Math.max(1, cur - Math.floor(max/2));
    const end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  getDirectionsUrl(): string {
    const biz = this.selectedBusiness();
    return biz ? this.buildDirectionsUrl(biz) : '#';
  }

  private buildDirectionsUrl(biz: Business): string {
    if (biz.latitude && biz.longitude) return `https://www.google.com/maps/dir/?api=1&destination=${biz.latitude},${biz.longitude}`;
    if (biz.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address)}`;
    return '#';
  }

  /** "Get Location" card action — prefers the business's own maps link, same as the Detail page. */
  getLocationUrl(biz: Business): string {
    return (biz as any).mapsLink || this.buildDirectionsUrl(biz);
  }

  getWhatsappUrl(number: string): string { return 'https://wa.me/' + number.replace(/\D/g, ''); }

  /**
   * `mailto:` links ignore `target="_blank"` in every major browser — the
   * OS mail handler is launched in-place instead of a real new tab. Opening
   * a blank tab first and then pointing *that* tab's location at `mailto:`
   * is the only reliable way to keep this page's tab untouched.
   */
  openMailto(email: string, event: Event): void {
    event.preventDefault();
    const win = window.open('', '_blank');
    if (win) {
      win.opener = null;
      win.location.href = 'mailto:' + email;
    } else {
      window.location.href = 'mailto:' + email;
    }
  }

  isDayActive(openingDays: string, day: string): boolean {
    return openingDays.split(',').some(x => x.trim().toLowerCase().startsWith(day.toLowerCase()));
  }

  getLocationDisplay(biz: Business): string {
    const b = biz as any;
    return [b.city, b.state].filter((v: any) => !!v).join(', ') || biz.address || '';
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  /** The list/detail API doesn't map `created_at` to camelCase `createdAt` — fall back to the raw column. */
  getCreatedAt(biz: Business): string | undefined {
    return biz.createdAt ?? (biz as any).created_at;
  }

  getFullLocation(biz: Business): string {
    const b = biz as any;
    return [b.city, b.state, biz.country].filter((v: any) => !!v).join(', ');
  }

  // ── Add/Edit Business modal — the form lives in app-business-form-modal;
  // this page only opens/closes it and applies the result to its own lists. ──
  openAddBusiness(): void {
    this.editBusinessId.set(null);
    this.showBusinessModal.set(true);
  }

  openEditBusiness(biz: Business): void {
    this.editBusinessId.set(biz.id);
    this.showBusinessModal.set(true);
  }

  closeBusinessModal(): void {
    this.showBusinessModal.set(false);
    this.editBusinessId.set(null);
  }

  onBusinessSaved(biz: Business): void {
    if (biz.status === 'PENDING') {
      // Not visible in the public list until approved — only reflect it
      // locally when the user is already looking at their Pending Approval
      // tab; refresh the badge count either way.
      this.loadMyPendingBusinessCount();
      if (this.pageTab() !== 'pending') return;
    }
    const exists = this.businesses().some(b => b.id === biz.id);
    if (exists) {
      this.businesses.update(list => list.map(b => b.id === biz.id ? biz : b));
      this.allFilteredBusinesses.update(list => list.map(b => b.id === biz.id ? biz : b));
    } else {
      this.businesses.update(list => [biz, ...list]);
      this.allFilteredBusinesses.update(list => [biz, ...list]);
      this.totalItems.update(v => v + 1);
    }
    if (this.selectedBusiness()?.id === biz.id) this.selectedBusiness.set(biz);
  }

  /** Whether the signed-in user owns this business (or, for admins, always via server-side checks — this only gates the UI). */
  isOwner(biz: Business): boolean {
    return !!this.authService.currentUser() && this.authService.currentUser()?.id === biz.userId;
  }

  // ── Card owner action menu (Edit/Delete, behind a three-dot trigger
  // instead of the Call/WhatsApp/Location icon buttons) ──
  toggleActionMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.openMenuId.update(cur => cur === id ? null : id);
  }

  onEditFromMenu(biz: Business): void {
    this.openMenuId.set(null);
    this.openEditBusiness(biz);
  }

  onDeleteFromMenu(biz: Business): void {
    this.openMenuId.set(null);
    this.openDeleteBusiness(biz);
  }

  @HostListener('document:click')
  closeActionMenu(): void {
    this.openMenuId.set(null);
  }

  // ── Delete Business — confirmation lives in app-business-delete-modal;
  // this page only opens/closes it and applies the result to its own lists. ──
  openDeleteBusiness(biz: Business): void {
    this.businessToDelete.set(biz);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.businessToDelete.set(null);
  }

  onBusinessDeleted(id: string): void {
    this.businesses.update(list => list.filter(b => b.id !== id));
    this.allFilteredBusinesses.update(list => list.filter(b => b.id !== id));
    this.totalItems.update(v => Math.max(0, v - 1));
    if (this.selectedBusiness()?.id === id) {
      this.selectedBusiness.set(null);
      this.currentView.set('list');
    }
  }
}