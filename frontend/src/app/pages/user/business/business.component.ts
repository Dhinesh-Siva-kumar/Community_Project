import { Component, OnInit, OnDestroy, HostListener, ElementRef, WritableSignal, ViewChild, inject, signal, computed, effect, viewChildren } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, map, debounceTime, distinctUntilChanged } from 'rxjs';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Business, BusinessCategory, PaginatedResponse, Country, GeoCountry, Division, OpeningDayKey } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { BusinessFormModalComponent } from '../../../shared/components/business-form-modal/business-form-modal.component';
import { BusinessHeroComponent } from '../../../shared/components/business-hero/business-hero.component';
import { BusinessDetailViewComponent } from '../../../shared/components/business-detail-view/business-detail-view.component';
import { OpeningHoursSummaryComponent } from '../../../shared/components/opening-hours-summary/opening-hours-summary.component';
import { ChipMultiSelectComponent } from '../../../shared/components/chip-multi-select/chip-multi-select.component';
import { RadioGroupComponent, RadioOption } from '../../../shared/components/radio-group/radio-group.component';
import { GeographyService } from '../../../core/services/geography.service';
import { BusinessQueryParams } from '../../../core/services/business.service';
import { DAY_KEYS, DAY_SHORT_KEYS, currentDayKey, currentHHmm } from '../../../shared/utils/opening-hours';
import { BusinessDeleteModalComponent } from '../../../shared/components/business-delete-modal/business-delete-modal.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard';
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

/** Server page size for the business list (both grid pages and list-view scroll batches). */
const BUSINESS_PAGE_SIZE = 20;

@Component({
  selector: 'app-user-business',
  standalone: true,
  imports: [DateInputComponent, CommonModule, FormsModule, SearchableSelectComponent, ImageUrlPipe, InfiniteScrollDirective, ScrollLockDirective, BusinessFormModalComponent, BusinessHeroComponent, BusinessDetailViewComponent, BusinessDeleteModalComponent, OpeningHoursSummaryComponent, ChipMultiSelectComponent, RadioGroupComponent, TranslatePipe],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the business list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class UserBusinessComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private layoutService     = inject(LayoutService);
  private toast             = inject(ToastService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private geographyService  = inject(GeographyService);

  @ViewChild('bizFormModal') bizFormModal?: BusinessFormModalComponent;

  /** Backs the `canDeactivate` route guard — the Add/Edit Business modal is the only unsaved-changes risk on this page. */
  hasUnsavedChanges(): boolean {
    return !!this.bizFormModal?.isDirty();
  }

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
  // List view — every server page fetched so far, accumulated as the user
  // scrolls (see loadMoreBusinesses), instead of Grid view's numbered
  // pagination which shows one page at a time.
  allFilteredBusinesses = signal<Business[]>([]);
  visibleBusinesses     = computed(() => this.allFilteredBusinesses());
  /** Set by loadMoreBusinesses so the next fetch appends instead of replacing. */
  private appendNextLoad = false;
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);
  showDeleteModal = signal(false);
  businessToDelete = signal<Business | null>(null);
  /** id of the card whose owner action menu (Edit/Delete) is currently open — only one at a time. */
  openMenuId = signal<string | null>(null);
  loading          = signal(true);
  /** Appending the next page in list view — keeps the current results visible. */
  loadingMore      = signal(false);
  /** Debounced mirror of filterSearch — what actually reaches the server. */
  private debouncedSearch = signal('');
  currentPage      = signal(1);
  totalPages       = signal(1);
  totalItems       = signal(0);
  activeImageIndex = signal(0);
  // Image lightbox — mirrors the Admin Business page's implementation.
  lightboxOpen   = signal(false);
  lightboxImages = signal<string[]>([]);

  // ── Filters — panel replicated from the Admin Business list page's
  // .jb-filter-panel (search + collapsible Advanced Filters), with Status
  // dropped (public users only ever see active businesses). ──
  filterSearch        = signal('');
  filterCountry       = signal<string | null>(null);
  filterCountryOptions: SelectOption[] = [];
  filterPincode       = signal('');
  filterDateFrom      = signal('');
  filterDateTo        = signal('');
  activeQuickRange    = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters = signal(false);
  /** Selected category ID for filter dropdown (null/empty = all) */
  filterCategoryId    = signal<string | null>(null);

  // ── Location (id-based, from the geography master data) ──
  /** master_countries ids. Multi-select, independent of the free-text country above. */
  filterCountryIds = signal<number[]>([]);
  filterStateId    = signal<number | null>(null);
  filterCityId     = signal<number | null>(null);
  geoCountries     = signal<GeoCountry[]>([]);
  divisionOptions  = signal<Division[]>([]);

  geoCountryOptions = computed<SelectOption[]>(() =>
    this.geoCountries().map(c => ({ value: c.id, label: `${c.flagEmoji ?? ''} ${c.name}`.trim() })),
  );
  divisionSelectOptions = computed<SelectOption[]>(() =>
    this.divisionOptions().map(d => ({ value: d.id, label: d.name })),
  );
  /** State/City only make sense once the location is narrowed to a single country. */
  singleSelectedCountryId = computed<number | null>(() =>
    this.filterCountryIds().length === 1 ? this.filterCountryIds()[0] : null,
  );

  // ── Visibility ──
  filterVisibility = signal<'' | 'COUNTRY' | 'WORLDWIDE'>('');
  readonly visibilityFilterOptions: RadioOption[] = [
    { value: '',          label: 'user.business.filter.visibilityAll' },
    { value: 'COUNTRY',   label: 'components.businessForm.visibilityCountry' },
    { value: 'WORLDWIDE', label: 'components.businessForm.visibilityWorldwide' },
  ];

  // ── Opening hours (structured) ──
  /** Evaluated against the viewer's own device clock — businesses carry no timezone. */
  filterOpenNow   = signal(false);
  filterOpenOnDay = signal<OpeningDayKey | null>(null);
  readonly DAY_KEYS = DAY_KEYS;
  readonly DAY_SHORT_KEYS = DAY_SHORT_KEYS;

  // ── Category (multi-select) + feature toggles ──
  filterCategoryIds = signal<string[]>([]);
  filterHasMenu     = signal(false);
  filterHasGallery  = signal(false);
  filterHasWhatsapp = signal(false);
  filterHasWebsite  = signal(false);

  categoryChipOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.id, label: c.name })),
  );

  /** Category options for the drill-down dropdown (includes "All Categories") */
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
    !!(this.filterSearch() || (this.filterCountry() !== this.getDefaultCountry()) || this.filterPincode()
      || this.filterDateFrom() || this.filterDateTo() || this.filterCategoryId()
      || this.activeFilterCount())
  );

  activeFilterCount = computed(() => {
    let count = 0;
    // The country filter defaults to the signed-in user's own country, so
    // only count/chip it when it differs from that default.
    if (this.filterCountry() !== this.getDefaultCountry()) count++;
    if (this.filterCountryIds().length) count++;
    if (this.filterStateId()) count++;
    if (this.filterCityId()) count++;
    if (this.filterPincode()) count++;
    if (this.filterVisibility()) count++;
    if (this.filterOpenNow()) count++;
    if (this.filterOpenOnDay()) count++;
    if (this.filterCategoryIds().length) count++;
    if (this.filterHasMenu()) count++;
    if (this.filterHasGallery()) count++;
    if (this.filterHasWhatsapp()) count++;
    if (this.filterHasWebsite()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  totalBusinesses  = computed(() => this.categories().reduce((s,c) => s + (c._count?.businesses ?? 0), 0));
  totalCategoriesCount = computed(() => this.categories().length);

  // ── Category view (legacy) controls ─────────────────────────
  catSearch   = signal('');
  // 'order' mirrors the admin-configured Display Order (the backend already
  // returns categories sorted that way) — the default, so a category an
  // admin has deliberately promoted or deprioritised shows accordingly here
  // too, not just in Admin's own category management page.
  catSortBy   = signal<'order'|'name'|'count'|'newest'>('order');
  catViewMode = signal<'grid'|'list'>('grid');
  bizViewMode = signal<'grid'|'list'>('grid');

  /** Sort options for the Category view's sort dropdown — same app-searchable-select used everywhere else on this page. */
  readonly catSortOptions: SelectOption[] = [
    { value: 'order',  label: 'user.business.sortOption.recommended' },
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
      case 'name':   list = [...list].sort((a,b) => a.name.localeCompare(b.name)); break;
      // 'order' — already sorted by display_order (then name) from the API.
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
    // Search hits the server on every change now (results are paged
    // server-side), so it's debounced rather than firing per keystroke.
    // Everything downstream still reads `debouncedSearch`, so the effect
    // below sees one settled value.
    toObservable(this.filterSearch)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(v => {
        if (v !== this.debouncedSearch()) this.currentPage.set(1);
        this.debouncedSearch.set(v);
      });

    // Auto-refresh whenever any filter changes
    effect(() => {
      this.debouncedSearch();
      this.filterCountry();
      this.filterCountryIds();
      this.filterStateId();
      this.filterCityId();
      this.filterPincode();
      this.filterVisibility();
      this.filterOpenNow();
      this.filterOpenOnDay();
      this.filterCategoryIds();
      this.filterHasMenu();
      this.filterHasGallery();
      this.filterHasWhatsapp();
      this.filterHasWebsite();
      this.filterDateFrom();
      this.filterDateTo();
      this.filterCategoryId();
      this.currentPage();
      // Guard on pageTab() too — otherwise returning from a business's detail
      // view (which flips currentView back to 'list' via popstate) silently
      // overwrote the "Pending Approval" tab's list with the full "All"
      // businesses fetch, since this effect fires on any currentView change.
      if (this.currentView() === 'list' && this.pageTab() === 'all') {
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
    // The constructor's effect() is the single trigger for the first fetch —
    // nothing else here calls loadNearbyBusinesses(), so exactly one request
    // goes out on load.
    this.filterCountry.set(this.getDefaultCountry());
    this.loadCategories();
    this.loadCountries();
    this.loadGeoCountries();
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

  /** Countries for the id-based Location filter's cascading dropdowns. */
  loadGeoCountries(): void {
    this.geographyService.getCountries().subscribe({
      next: (list) => this.geoCountries.set(list),
      error: () => {},
    });
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

  /** activeOnly — a deprioritised category (e.g. "Bar") shouldn't appear as
   * a browsable tile or filter option for regular users; a business that
   * already has one keeps showing it correctly on its own card/detail page
   * regardless, since that reads the business record directly, not this list. */
  loadCategories(): void {
    this.loading.set(true);
    this.svc.getCategories(true).subscribe({
      next: data => { this.categories.set(data); this.loading.set(false); },
      error: () => { this.toast.error('user.business.toast.failedLoadCategories'); this.loading.set(false); },
    });
  }

  /** Every active filter, as the query params the list endpoint expects. */
  private buildQueryParams(): BusinessQueryParams {
    const params: BusinessQueryParams = { page: this.currentPage(), limit: BUSINESS_PAGE_SIZE };

    if (this.filterCategoryId()) params.categoryId = this.filterCategoryId()!;
    if (this.filterCategoryIds().length) params.categoryIds = this.filterCategoryIds().join(',');
    if (this.debouncedSearch()) params.search = this.debouncedSearch();
    if (this.filterCountry()) params.country = this.filterCountry()!;
    if (this.filterCountryIds().length) params.countryIds = this.filterCountryIds().join(',');
    if (this.filterStateId()) params.stateId = this.filterStateId()!;
    if (this.filterCityId()) params.cityId = this.filterCityId()!;
    if (this.filterPincode()) params.pincode = this.filterPincode();
    if (this.filterVisibility()) params.visibilityType = this.filterVisibility() as 'COUNTRY' | 'WORLDWIDE';
    if (this.filterOpenOnDay()) params.openOnDay = this.filterOpenOnDay()!;

    // "Open now" is resolved against the viewer's device clock and sent as an
    // explicit day + HH:mm — businesses carry no timezone, so there is no
    // meaningful server-side "now".
    if (this.filterOpenNow()) {
      params.openNowDay = currentDayKey();
      params.openNowTime = currentHHmm();
    }

    // Only sent when true: api.get() strips ''/null/undefined, but a literal
    // `false` would survive and be parsed as an active filter.
    if (this.filterHasMenu()) params.hasMenu = true;
    if (this.filterHasGallery()) params.hasGallery = true;
    if (this.filterHasWhatsapp()) params.hasWhatsapp = true;
    if (this.filterHasWebsite()) params.hasWebsite = true;

    if (this.filterDateFrom()) params.dateFrom = this.filterDateFrom();
    if (this.filterDateTo()) params.dateTo = this.filterDateTo();

    return params;
  }

  /**
   * Loads one server page of businesses.
   *
   * Paging is server-side: filters like "Open now" are evaluated in SQL
   * across the whole table, so slicing a fixed prefix client-side (as this
   * page used to) would silently under-report matches beyond it.
   *
   * `append` is the list view's infinite scroll adding the next page;
   * the grid view replaces the page instead.
   */
  loadNearbyBusinesses(): void {
    // Read-and-clear: only the infinite-scroll path sets this, so every other
    // trigger (a filter change, a grid page click) replaces the list.
    const append = this.appendNextLoad;
    this.appendNextLoad = false;

    this.currentView.set('list');
    this.businessView.set('list');
    if (append) this.loadingMore.set(true); else this.loading.set(true);

    this.svc.getBusinesses(this.buildQueryParams()).subscribe({
      next: (res: PaginatedResponse<Business>) => {
        this.businesses.set(res.data);
        this.totalItems.set(res.total);
        this.totalPages.set(Math.max(1, res.totalPages));

        // List view keeps everything loaded so far so scrolling back up
        // doesn't lose earlier pages.
        this.allFilteredBusinesses.update(prev => append ? [...prev, ...res.data] : res.data);

        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.toast.error('user.business.toast.failedLoadBusinesses');
        this.loading.set(false);
        this.loadingMore.set(false);
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

  // ── Location filter (cascading, id-based) ──
  onFilterCountryIdsChange(ids: (string | number)[]): void {
    const next = ids.map(Number).filter(n => Number.isInteger(n));
    this.filterCountryIds.set(next);
    // State/City belong to a single country — narrowing or widening the
    // country set invalidates whatever was chosen below it.
    this.filterStateId.set(null);
    this.filterCityId.set(null);
    this.divisionOptions.set([]);
    if (next.length === 1) this.loadDivisions(next[0]);
    this.currentPage.set(1);
  }

  private loadDivisions(countryId: number): void {
    this.geographyService.getDivisions(countryId).subscribe({
      next: (list) => this.divisionOptions.set(list),
      error: () => this.divisionOptions.set([]),
    });
  }

  onFilterStateChange(value: string | number | null): void {
    this.filterStateId.set(value ? Number(value) : null);
    this.filterCityId.set(null);
    this.currentPage.set(1);
  }

  onFilterCityChange(value: string | number | null): void {
    this.filterCityId.set(value ? Number(value) : null);
    this.currentPage.set(1);
  }

  /** Remote city search, scoped to the selected state or country. */
  citySearchFn = (query: string): Observable<SelectOption[]> => {
    const countryId = this.singleSelectedCountryId();
    const divisionId = this.filterStateId() ?? undefined;
    if (!countryId) return of([]);
    return this.geographyService.searchCities({
      divisionId,
      countryId: divisionId ? undefined : countryId,
      search: query, page: 1, limit: 20,
    }).pipe(map(res => res.data.map(c => ({ value: c.id, label: c.name }))));
  };

  // ── Visibility / hours / category / feature filters ──
  onFilterVisibilityChange(value: string | number | null): void {
    this.filterVisibility.set((value ?? '') as '' | 'COUNTRY' | 'WORLDWIDE');
    this.currentPage.set(1);
  }

  toggleOpenNow(): void {
    this.filterOpenNow.update(v => !v);
    this.currentPage.set(1);
  }

  toggleOpenOnDay(day: OpeningDayKey): void {
    this.filterOpenOnDay.update(d => (d === day ? null : day));
    this.currentPage.set(1);
  }

  onFilterCategoryIdsChange(ids: (string | number)[]): void {
    this.filterCategoryIds.set(ids.map(String));
    this.currentPage.set(1);
  }

  toggleFeatureFilter(key: 'menu' | 'gallery' | 'whatsapp' | 'website'): void {
    const sig = {
      menu: this.filterHasMenu, gallery: this.filterHasGallery,
      whatsapp: this.filterHasWhatsapp, website: this.filterHasWebsite,
    }[key];
    sig.update(v => !v);
    this.currentPage.set(1);
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
    this.filterCountryIds.set([]);
    this.filterStateId.set(null);
    this.filterCityId.set(null);
    this.divisionOptions.set([]);
    this.filterVisibility.set('');
    this.filterOpenNow.set(false);
    this.filterOpenOnDay.set(null);
    this.filterCategoryIds.set([]);
    this.filterHasMenu.set(false);
    this.filterHasGallery.set(false);
    this.filterHasWhatsapp.set(false);
    this.filterHasWebsite.set(false);
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.showAdvancedFilters.set(false);
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

  removeFilter(filterKey: 'search' | 'country' | 'countries' | 'state' | 'city' | 'pincode'
    | 'visibility' | 'openNow' | 'openOnDay' | 'categories'
    | 'hasMenu' | 'hasGallery' | 'hasWhatsapp' | 'hasWebsite'
    | 'dateFrom' | 'dateTo' | 'category'): void {
    switch (filterKey) {
      case 'search':      this.filterSearch.set(''); break;
      case 'country':     this.filterCountry.set(null); break;
      case 'countries':   this.onFilterCountryIdsChange([]); break;
      case 'state':       this.filterStateId.set(null); this.filterCityId.set(null); break;
      case 'city':        this.filterCityId.set(null); break;
      case 'pincode':     this.filterPincode.set(''); break;
      case 'visibility':  this.filterVisibility.set(''); break;
      case 'openNow':     this.filterOpenNow.set(false); break;
      case 'openOnDay':   this.filterOpenOnDay.set(null); break;
      case 'categories':  this.filterCategoryIds.set([]); break;
      case 'hasMenu':     this.filterHasMenu.set(false); break;
      case 'hasGallery':  this.filterHasGallery.set(false); break;
      case 'hasWhatsapp': this.filterHasWhatsapp.set(false); break;
      case 'hasWebsite':  this.filterHasWebsite.set(false); break;
      case 'dateFrom':    this.filterDateFrom.set(''); break;
      case 'dateTo':      this.filterDateTo.set(''); break;
      case 'category':    this.filterCategoryId.set(null); break;
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

  /** List view's infinite scroll — fetches and appends the next server page. */
  loadMoreBusinesses(): void {
    if (this.loading() || this.loadingMore()) return;
    if (this.currentPage() >= this.totalPages()) return;
    // Bumping the page re-fires the filter effect; this flag tells that fetch
    // to append rather than replace what's already on screen.
    this.appendNextLoad = true;
    this.currentPage.set(this.currentPage() + 1);
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