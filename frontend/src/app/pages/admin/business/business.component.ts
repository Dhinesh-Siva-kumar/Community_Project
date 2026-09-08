import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { Subject, takeUntil, Observable, of, map } from 'rxjs';
import { BusinessService, BusinessQueryParams } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { Business, BusinessCategory, PaginatedResponse, Country, GeoCountry, Division, OpeningDayKey } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { TruncatedDirective } from '../../../shared/directives/truncated.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { BusinessFormModalComponent } from '../../../shared/components/business-form-modal/business-form-modal.component';
import { BusinessHeroComponent } from '../../../shared/components/business-hero/business-hero.component';
import { BusinessDetailViewComponent } from '../../../shared/components/business-detail-view/business-detail-view.component';
import { OpeningHoursSummaryComponent } from '../../../shared/components/opening-hours-summary/opening-hours-summary.component';
import { ChipMultiSelectComponent } from '../../../shared/components/chip-multi-select/chip-multi-select.component';
import { RadioGroupComponent, RadioOption } from '../../../shared/components/radio-group/radio-group.component';
import { DAY_KEYS, DAY_SHORT_KEYS, currentDayKey, currentHHmm } from '../../../shared/utils/opening-hours';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

// Remembers the last selected category view mode (grid/list) across navigations.
const CAT_VIEW_STORAGE_KEY = 'admin-business:viewMode';
// Remembers the last selected business-list view mode (grid/table) across navigations.
const LIST_VIEW_STORAGE_KEY = 'admin-business:listViewMode';
// Remembers the last selected Category View / Business View scope across navigations.
const SCOPE_STORAGE_KEY = 'admin-business:scope';

type ViewState = 'categories' | 'list' | 'detail';

/**
 * Shape pushed to `history.pushState` for each drill-down level, so the
 * browser Back/Forward buttons step through categories → list → detail
 * instead of leaving the page entirely. The category/business objects are
 * carried in the state itself so restoring a view on popstate never needs
 * a re-fetch or an array lookup that might miss (e.g. after pagination).
 */
interface BusinessNavState {
  view: ViewState;
  category?: BusinessCategory;
  business?: Business;
}

@Component({
  selector: 'app-admin-business',
  standalone: true,
  imports: [DateInputComponent, CommonModule, ReactiveFormsModule, FormsModule, RouterLink, SearchableSelectComponent, ImageErrorHandlerDirective, TruncatedDirective, ScrollLockDirective, ImageUrlPipe, SortBarComponent, BusinessFormModalComponent, BusinessHeroComponent, BusinessDetailViewComponent, OpeningHoursSummaryComponent, ChipMultiSelectComponent, RadioGroupComponent, TranslatePipe],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the business list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class AdminBusinessComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private businessService   = inject(BusinessService);
  private authService       = inject(AuthService);
  private layoutService     = inject(LayoutService);
  private toast             = inject(ToastService);
  private geographyService  = inject(GeographyService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  // ── Countries for filter dropdown ──────────────────────────
  filterCountryOptions: SelectOption[] = [];

  // View state
  currentView = signal<ViewState>('categories');
  // "Category View" (browse via category cards) vs "Business View" (flat
  // list of every business, regardless of category) — the toggle that sits
  // in the search card before the Grid/List (or Grid/Table) switch. Drilling
  // into a specific category (loadBusinesses with a category) still counts
  // as "categories" scope for this toggle; only the flat cross-category
  // list (loadBusinesses(null, ...)) counts as "business" scope.
  businessScope = signal<'categories' | 'business'>('categories');

  // Floating header action (shows once scrolled past the page header)
  showHeaderFab = signal(false);
  private scrollTicking = false;

  // Data
  categories = signal<BusinessCategory[]>([]);
  businesses = signal<Business[]>([]);
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);

  // List view stat-card counts — fetched separately (see
  // loadBusinessStatusCounts()) rather than derived from the currently
  // loaded `businesses()` array. Deriving them from `businesses()` meant
  // that clicking "Active" (which filters the list server-side) made the
  // "Inactive" card's own count collapse to 0 — and vice versa — since the
  // loaded page no longer contained any of the other status, making the
  // stat bar look broken/inconsistent right after using it.
  totalBusinessesStatCount = signal(0);
  activeBusinessCount      = signal(0);
  inactiveBusinessCount    = signal(0);

  // Computed options for the category dropdown
  categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.id, label: c.name }))
  );

  // Loading
  loading = signal(true);
  // Gates the top-level full-page spinner AND each view's own skeleton —
  // true only until the very first fetch (categories or business list)
  // resolves, then stays true forever after. Later fetches (stat-card
  // click, search, filter, sort) still flip `loading`, but the page's own
  // content stays mounted throughout instead of unmounting into a spinner/
  // skeleton and back, which read as the whole page blinking.
  pageReady = signal(false);
  submitting = signal(false);
  deletingId = signal<string | null>(null);

  // Gates the "Business logo is required" error until the admin actually
  // tries to submit — matches the Community page's image-required pattern.

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);

  // Modals
  showAddBusinessModal = signal(false);
  /** Non-null while app-business-form-modal is open in edit mode. */
  editBusinessId = signal<string | null>(null);
  showAddCategoryModal = signal(false);
  editingCategory = signal<BusinessCategory | null>(null);
  showDeleteCategoryConfirm = signal(false);
  categoryToDelete = signal<BusinessCategory | null>(null);
  deletingCategoryId = signal<string | null>(null);

  // Icon picker
  iconPickerOpen = signal(false);
  iconSearch = signal('');

  readonly ALL_ICONS = [
    'bi-shop','bi-cup-hot','bi-building','bi-hospital','bi-house',
    'bi-cart','bi-bag','bi-bank','bi-briefcase','bi-truck',
    'bi-airplane','bi-camera','bi-car-front','bi-bicycle','bi-book',
    'bi-bookmark','bi-box','bi-brush','bi-calculator','bi-calendar',
    'bi-cash-coin','bi-chat','bi-clock','bi-cloud','bi-compass',
    'bi-cpu','bi-credit-card','bi-cup','bi-display','bi-droplet',
    'bi-egg-fried','bi-envelope','bi-fire','bi-flower1','bi-fuel-pump',
    'bi-gear','bi-gift','bi-globe','bi-graph-up','bi-hammer',
    'bi-headphones','bi-heart','bi-house-door','bi-key','bi-laptop',
    'bi-layers','bi-lightbulb','bi-map','bi-megaphone','bi-mic',
    'bi-music-note','bi-paint-bucket','bi-palette','bi-patch-check',
    'bi-people','bi-person','bi-phone','bi-pin-map','bi-printer',
    'bi-puzzle','bi-receipt','bi-scissors','bi-shield-check',
    'bi-shop-window','bi-star','bi-stethoscope','bi-sun','bi-tag',
    'bi-tools','bi-tree','bi-trophy','bi-tv','bi-umbrella',
    'bi-wallet','bi-watch','bi-wifi','bi-wrench','bi-hospital-fill',
    'bi-capsule','bi-bandaid','bi-activity','bi-basket','bi-beer',
    'bi-building-fill','bi-buildings','bi-bus-front','bi-cake',
    'bi-cart-check','bi-cash-stack','bi-coin','bi-controller',
    'bi-cup-straw','bi-currency-dollar','bi-currency-pound',
    'bi-diamond','bi-door-open','bi-film','bi-flag','bi-fork-knife',
    'bi-gem','bi-globe2','bi-grid','bi-handbag','bi-house-add',
    'bi-ice-cream','bi-journal','bi-lamp','bi-lightning','bi-lock',
    'bi-mortarboard','bi-newspaper','bi-person-badge','bi-piggy-bank',
    'bi-plug','bi-rocket','bi-safe','bi-suitcase','bi-telephone',
    'bi-ticket','bi-toolbox','bi-trophy-fill','bi-truck-front',
    'bi-vehicle-front','bi-person-workspace','bi-map-fill',
    'bi-house-heart','bi-joystick','bi-sign-stop','bi-translate',
    'bi-smartwatch','bi-speakerphone','bi-flower2','bi-emoji-smile',
  ];

  filteredIcons = computed(() => {
    const q = this.iconSearch().toLowerCase().replace(/^bi-/, '');
    const list = q ? this.ALL_ICONS.filter(i => i.replace('bi-', '').includes(q)) : this.ALL_ICONS;
    return list.slice(0, 80);
  });

  // Image lightbox preview — same pattern as the Community Post image viewer
  // (community-detail.component's .cd-lightbox), reused as-is so logo/gallery
  // previews look and behave identically to viewing a community post's images.
  lightboxOpen = signal(false);
  lightboxImages = signal<string[]>([]);
  activeImageIndex = signal(0);
  showDeleteBusinessConfirm = signal(false);
  businessToDelete      = signal<Business | null>(null);

  // Icon configuration for category modal
  categoryIcons = [
    { icon: 'bi-shop', bgColor: '#fff4e6', iconColor: '#ff9500', label: 'admin.business.label.retail' },
    { icon: 'bi-cup', bgColor: '#fff3cd', iconColor: '#ff8c00', label: 'admin.business.label.restaurants' },
    { icon: 'bi-hospital', bgColor: '#ffe5e5', iconColor: '#e74c3c', label: 'admin.business.label.healthcare' },
    { icon: 'bi-tools', bgColor: '#e0f7f4', iconColor: '#17a2b8', label: 'admin.business.label.services' },
    { icon: 'bi-laptop', bgColor: '#f3e5f5', iconColor: '#7b3ff2', label: 'admin.business.label.technology' },
    { icon: 'bi-palette', bgColor: '#fce4ec', iconColor: '#e91e63', label: 'admin.business.label.design' },
    { icon: 'bi-book', bgColor: '#e3f2fd', iconColor: '#2196f3', label: 'admin.business.label.education' },
    { icon: 'bi-briefcase', bgColor: '#e8eaf6', iconColor: '#3f51b5', label: 'admin.business.label.business' },
    { icon: 'bi-house', bgColor: '#e8f5e9', iconColor: '#4caf50', label: 'admin.business.label.realEstate' },
    { icon: 'bi-car-front', bgColor: '#ecf0f1', iconColor: '#34495e', label: 'admin.business.label.automotive' },
  ];

  // Advanced filters - match admin-community pattern
  filterSearch = signal('');
  filterCountry = signal<string | null>(null);
  filterPincode = signal('');
  filterStatus = signal<'active' | 'inactive' | ''>('');
  filterDateFrom = signal('');
  filterDateTo = signal('');
  activeQuickRange = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters = signal(false);

  // ── Location (id-based, from the geography master data) ──
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
  /** State/City only make sense once the location is narrowed to one country. */
  singleSelectedCountryId = computed<number | null>(() =>
    this.filterCountryIds().length === 1 ? this.filterCountryIds()[0] : null,
  );

  // ── Visibility ──
  filterVisibility = signal<'' | 'COUNTRY' | 'WORLDWIDE'>('');
  readonly visibilityFilterOptions: RadioOption[] = [
    { value: '',          label: 'admin.business.filter.visibilityAll' },
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

  // ── Business list view mode (grid/table) ────────────────────
  listViewMode = signal<'grid' | 'table'>('grid');

  readonly statusFilterOptions: SelectOption[] = [
    { value: '',         label: 'admin.business.label.allStatus' },
    { value: 'active',   label: 'admin.business.label.active' },
    { value: 'inactive', label: 'admin.business.label.inactive' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize = signal(20);

  // ── Sort — driven by the sort-bar above the grid ────────────
  readonly sortFields: SortField[] = [
    { key: 'name',   label: 'admin.business.label.name' },
    { key: 'joined', label: 'admin.business.label.created' },
  ];
  sortBy  = signal<'name' | 'joined'>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as 'name' | 'joined');
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  /** Toggle sort for a clickable table column header — re-clicking the same column flips direction. */
  toggleSort(field: 'name' | 'joined'): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('desc');
    }
    this.applyFilters();
  }

  hasActiveFilters = computed(() => !!(this.filterSearch() || this.activeFilterCount()));

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterSearch()) count++;
    if (this.filterCountry()) count++;
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
    if (this.filterStatus()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  // Forms
  businessForm!: FormGroup;
  categoryForm!: FormGroup;

  // Stats
  totalBusinesses = computed(() => {
    let sum = 0;
    this.categories().forEach((c) => (sum += c._count?.businesses ?? 0));
    return sum;
  });
  totalCategories = computed(() => this.categories().length);
  avgBusinessesPerCategory = computed(() => {
    const cats = this.totalCategories();
    return cats > 0 ? Math.round(this.totalBusinesses() / cats) : 0;
  });
  emptyCategoriesCount = computed(() =>
    this.categories().filter((c) => (c._count?.businesses ?? 0) === 0).length
  );

  // ── Category view controls ───────────────────────────────────
  catSearch   = signal('');
  catSortBy   = signal<'name'|'count'>('name');
  catSortDir  = signal<SortDir>('asc');
  catViewMode = signal<'grid'|'list'>('grid');
  /** Stat-card filter — every card in the row drives this one signal, so
   * exactly one card is ever selected at a time (radio-button behaviour)
   * instead of the "Businesses"/"Avg per Category" cards living on a
   * separate, independently-toggleable axis from "Empty Categories". */
  catFilter = signal<'all' | 'nonEmpty' | 'empty' | 'aboveAvg'>('all');

  /** Toggles off back to 'all' on a repeat click of the same filter. */
  setCatFilter(value: 'all' | 'nonEmpty' | 'empty' | 'aboveAvg'): void {
    this.catFilter.set(this.catFilter() === value ? 'all' : value);
    this.catPage.set(1);
  }

  // Grid-view sort — same pill-style sort-bar as the community grid, shown
  // above the grid only (the table view sorts via its own column headers).
  readonly catSortFields: SortField[] = [
    { key: 'name',  label: 'admin.business.label.name' },
    { key: 'count', label: 'admin.business.label.businesses' },
  ];

  onCatSortBarChange(change: SortChange): void {
    this.catSortBy.set(change.sortBy as 'name' | 'count');
    this.catSortDir.set(change.sortDir);
    this.catPage.set(1);
  }

  /** Toggle sort for a clickable table column header — re-clicking the same column flips direction. */
  toggleCatSort(field: 'name' | 'count'): void {
    if (this.catSortBy() === field) {
      this.catSortDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.catSortBy.set(field);
      this.catSortDir.set(field === 'count' ? 'desc' : 'asc');
    }
    this.catPage.set(1);
  }

  onCatSearchChange(value: string): void {
    this.catSearch.set(value);
    this.catPage.set(1);
  }

  clearCatSearch(): void {
    this.catSearch.set('');
    this.catPage.set(1);
  }

  // ── Category pagination (client-side — categories load in a single batch) ──
  catPage     = signal(1);
  catPageSize = signal(20);

  catTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredCategories().length / this.catPageSize()))
  );

  paginatedCategories = computed(() => {
    const list = this.filteredCategories();
    const size = this.catPageSize();
    const totalPages = Math.max(1, Math.ceil(list.length / size));
    const page = Math.min(Math.max(1, this.catPage()), totalPages);
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  onCatPageSizeChange(size: number): void {
    this.catPageSize.set(size);
    this.catPage.set(1);
  }

  goToCatPage(page: number): void {
    if (page < 1 || page > this.catTotalPages()) return;
    this.catPage.set(page);
  }

  getCatPages(): number[] {
    const total = this.catTotalPages();
    const current = Math.min(this.catPage(), total);
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  catShowingFrom(): number {
    const total = this.filteredCategories().length;
    return total === 0 ? 0 : (Math.min(this.catPage(), this.catTotalPages()) - 1) * this.catPageSize() + 1;
  }

  catShowingTo(): number {
    return Math.min(Math.min(this.catPage(), this.catTotalPages()) * this.catPageSize(), this.filteredCategories().length);
  }

  /** Category IDs whose description text is actually clipped — gates the hover "read more" popover. */
  truncatedCategoryIds = signal<Set<string>>(new Set());

  onDescTruncatedChange(categoryId: string, isTruncated: boolean): void {
    const current = this.truncatedCategoryIds();
    if (current.has(categoryId) === isTruncated) return;
    const next = new Set(current);
    if (isTruncated) next.add(categoryId); else next.delete(categoryId);
    this.truncatedCategoryIds.set(next);
  }

  filteredCategories = computed(() => {
    const q = this.catSearch().toLowerCase();
    let list = q ? this.categories().filter(c => c.name.toLowerCase().includes(q)) : this.categories();
    const catFilter = this.catFilter();
    if (catFilter === 'empty')    list = list.filter(c => (c._count?.businesses ?? 0) === 0);
    if (catFilter === 'nonEmpty') list = list.filter(c => (c._count?.businesses ?? 0) > 0);
    if (catFilter === 'aboveAvg') { const avg = this.avgBusinessesPerCategory(); list = list.filter(c => (c._count?.businesses ?? 0) >= avg); }
    const dir = this.catSortDir() === 'asc' ? 1 : -1;
    switch (this.catSortBy()) {
      case 'count':  list = [...list].sort((a,b) => dir * ((a._count?.businesses??0) - (b._count?.businesses??0))); break;
      default:       list = [...list].sort((a,b) => dir * a.name.localeCompare(b.name));
    }
    return list;
  });

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
    'bi-airplane':'navy','bi-globe':'navy','bi-shield-check':'navy',
    'bi-laptop':'purple',
  };

getCategoryAccent(icon?: string): string {
    return this.ACCENT_MAP[icon ?? ''] ?? 'orange';
  }


  ngOnInit(): void {
    this.restoreSavedViewMode();
    this.restoreSavedListViewMode();
    this.restoreSavedBusinessScope();
    this.initForms();
    this.loadCountries();
    this.loadGeoCountries();
    this.loadCategories();
    // Resume straight into the flat Business View if that's what was last
    // selected — the default 'categories' currentView already covers the
    // other case, so nothing extra is needed there.
    if (this.businessScope() === 'business') this.loadBusinesses(null, true, false);
  }

  /** Resume the last selected grid/list view across navigations. */
  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(CAT_VIEW_STORAGE_KEY);
    if (saved === 'grid' || saved === 'list') this.catViewMode.set(saved);
  }

  setCatViewMode(mode: 'grid' | 'list'): void {
    this.catViewMode.set(mode);
    sessionStorage.setItem(CAT_VIEW_STORAGE_KEY, mode);
  }

  /** Resume the last selected grid/table view for the business list across navigations. */
  private restoreSavedListViewMode(): void {
    const saved = sessionStorage.getItem(LIST_VIEW_STORAGE_KEY);
    if (saved === 'grid' || saved === 'table') this.listViewMode.set(saved);
  }

  setListViewMode(mode: 'grid' | 'table'): void {
    this.listViewMode.set(mode);
    sessionStorage.setItem(LIST_VIEW_STORAGE_KEY, mode);
  }

  /** Resume the last selected Category View / Business View scope across navigations. */
  private restoreSavedBusinessScope(): void {
    const saved = sessionStorage.getItem(SCOPE_STORAGE_KEY);
    if (saved === 'categories' || saved === 'business') this.businessScope.set(saved);
  }

  ngOnDestroy(): void {
    this.layoutService.forceSidebarCollapsed.set(false);
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.showHeaderFab.set(window.scrollY >= 120);
      this.scrollTicking = false;
    });
  }

  /** Browser Back/Forward — steps through categories → list → detail instead of leaving the page. */
  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    this.applyHistoryState((event.state ?? null) as BusinessNavState | null);
  }

  private applyHistoryState(state: BusinessNavState | null): void {
    // Back/Forward steps between categories → list → detail same as a fresh
    // click into any of them would — each should land at the top of that
    // view, not wherever the previous view happened to be scrolled to.
    this.scrollToTop();

    if (state?.view === 'detail' && state.business) {
      if (state.category) this.selectedCategory.set(state.category);
      this.selectedBusiness.set(state.business);
      this.activeImageIndex.set(0);
      this.currentView.set('detail');
      return;
    }

    if (state?.view === 'list') {
      this.selectedBusiness.set(null);
      this.loadBusinesses(state.category ?? null, true, false);
      return;
    }

    // Fallback: categories view (also covers the initial entry, whose state is null).
    this.currentView.set('categories');
    this.businessScope.set('categories');
    this.selectedCategory.set(null);
    this.selectedBusiness.set(null);
    this.businesses.set([]);
    this.currentPage.set(1);
    this.filterSearch.set('');
    this.filterCountry.set(null);
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
    this.filterStatus.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({
          value: c.name,
          label: c.name,
        }));
      },
      error: () => this.toast.error('admin.business.toast.failedLoadCountries'),
    });
  }

  /**
   * Only the Add/Edit Category form lives here now — the Business form moved
   * into the shared app-business-form-modal along with all of its
   * phone/geography/opening-hours wiring.
   */
  private initForms(): void {
    this.categoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      icon: ['bi-shop', Validators.required],
      description: ['', [Validators.maxLength(300)]],
    });
  }

  /**
   * `silent` skips the loading-skeleton flip — used when refreshing after a
   * create/edit/delete whose modal already closed over an unchanged scroll
   * position. Toggling `loading` there would unmount the whole
   * grid/table/page behind it (this page's top-level `@if (loading())` gate
   * hides everything) and collapse the page height, snapping the scroll
   * back to the top.
   */
  loadCategories(silent = false): void {
    if (!silent) this.loading.set(true);
    this.businessService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
        if (!silent) this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => {
        this.toast.error('admin.business.toast.failedLoadCategories');
        if (!silent) this.loading.set(false);
        this.pageReady.set(true);
      },
    });
  }

  /**
   * Every active filter, as the query params the list endpoint expects.
   * Shared by the list fetch and the stat-card counts so the two can't
   * disagree about what's currently filtered.
   */
  private buildFilterParams(): BusinessQueryParams {
    const params: BusinessQueryParams = {};

    if (this.filterSearch()) params.search = this.filterSearch();
    if (this.filterCountry()) params.country = this.filterCountry()!;
    if (this.filterCountryIds().length) params.countryIds = this.filterCountryIds().join(',');
    if (this.filterStateId()) params.stateId = this.filterStateId()!;
    if (this.filterCityId()) params.cityId = this.filterCityId()!;
    if (this.filterPincode()) params.pincode = this.filterPincode();
    if (this.filterVisibility()) params.visibilityType = this.filterVisibility() as 'COUNTRY' | 'WORLDWIDE';
    if (this.filterCategoryIds().length) params.categoryIds = this.filterCategoryIds().join(',');
    if (this.filterOpenOnDay()) params.openOnDay = this.filterOpenOnDay()!;

    // "Open now" is resolved against the admin's own device clock and sent as
    // an explicit day + HH:mm — businesses carry no timezone.
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

    if (this.filterStatus()) params.status = this.filterStatus();
    if (this.filterDateFrom()) params.dateFrom = this.filterDateFrom();
    if (this.filterDateTo()) params.dateTo = this.filterDateTo();

    return params;
  }

  loadBusinesses(category: BusinessCategory | null, resetPage = false, pushHistory = false, silent = false): void {
    this.selectedCategory.set(category);
    this.currentView.set('list');
    this.businessScope.set(category ? 'categories' : 'business');
    if (resetPage) this.currentPage.set(1);
    if (pushHistory) {
      history.pushState({ view: 'list', category: category ?? undefined } satisfies BusinessNavState, '');
      // Only a genuine categories → list navigation (not an in-place filter/
      // sort/pagination refresh, which also calls this method) should reset
      // scroll — otherwise re-filtering while scrolled through results would
      // yank the admin back to the top mid-browse.
      this.scrollToTop();
    }
    if (!silent) this.loading.set(true);
    this.loadBusinessStatusCounts(category);

    const params: BusinessQueryParams = {
      ...this.buildFilterParams(),
      page: this.currentPage(),
      limit: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    if (category) params.categoryId = category.id;

    this.businessService.getBusinesses(params).subscribe({
      next: (response: PaginatedResponse<Business>) => {
        // The current page may no longer exist (e.g. the last item on the last
        // page was deleted) — fall back to the last valid page.
        if (response.totalPages > 0 && this.currentPage() > response.totalPages) {
          this.currentPage.set(response.totalPages);
          this.loadBusinesses(category, false, false, silent);
          return;
        }
        this.businesses.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        if (!silent) this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => {
        this.toast.error('admin.business.toast.failedLoadBusinesses');
        if (!silent) this.loading.set(false);
        this.pageReady.set(true);
      },
    });
  }

  /** Switches between "Category View" (categories grid) and "Business View"
   * (flat list of every business, regardless of category) — the toggle
   * placed in the search card before the Grid/List switch. */
  setBusinessScope(mode: 'categories' | 'business'): void {
    sessionStorage.setItem(SCOPE_STORAGE_KEY, mode);
    if (mode === 'categories') {
      if (this.currentView() === 'categories') return;
      this.businessScope.set('categories');
      this.currentView.set('categories');
      this.selectedCategory.set(null);
      this.selectedBusiness.set(null);
      history.pushState({ view: 'categories' } satisfies BusinessNavState, '');
      this.scrollToTop();
    } else {
      if (this.currentView() === 'list' && !this.selectedCategory()) return;
      this.loadBusinesses(null, true, true);
    }
  }

  /** Powers the List view's Total/Active/Inactive stat cards — three
   * lightweight `limit:1` calls scoped by category + every filter except
   * `status` itself, so the counts stay accurate regardless of which
   * status card (if any) is currently selected, instead of being derived
   * from whatever page `businesses()`/`totalItems()` currently holds. */
  private loadBusinessStatusCounts(category: BusinessCategory | null): void {
    const baseParams: BusinessQueryParams = { ...this.buildFilterParams(), page: 1, limit: 1 };
    // `status` is what the three cards differ on, so it must not be inherited.
    delete baseParams.status;
    if (category) baseParams.categoryId = category.id;

    this.businessService.getBusinesses(baseParams).subscribe({
      next: (res) => this.totalBusinessesStatCount.set(res.total),
      error: () => {},
    });
    this.businessService.getBusinesses({ ...baseParams, status: 'active' }).subscribe({
      next: (res) => this.activeBusinessCount.set(res.total),
      error: () => {},
    });
    this.businessService.getBusinesses({ ...baseParams, status: 'inactive' }).subscribe({
      next: (res) => this.inactiveBusinessCount.set(res.total),
      error: () => {},
    });
  }

  loadBusinessDetail(business: Business): void {
    this.selectedBusiness.set(business);
    this.activeImageIndex.set(0);
    this.currentView.set('detail');
    history.pushState({ view: 'detail', category: this.selectedCategory() ?? undefined, business } satisfies BusinessNavState, '');
    // Without this, opening a business from further down the (possibly
    // scrolled) list left the page at whatever scroll position the list was
    // at, so the detail view could open already scrolled past its header.
    this.scrollToTop();
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  applyFilters(): void {
    if (this.currentView() !== 'list') return;
    this.loadBusinesses(this.selectedCategory(), true);
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

  removeFilter(filterKey: 'search' | 'country' | 'countries' | 'state' | 'city' | 'pincode'
    | 'visibility' | 'openNow' | 'openOnDay' | 'categories'
    | 'hasMenu' | 'hasGallery' | 'hasWhatsapp' | 'hasWebsite'
    | 'status' | 'dateFrom' | 'dateTo'): void {
    switch (filterKey) {
      case 'search':
        this.filterSearch.set('');
        break;
      case 'country':
        this.filterCountry.set(null);
        break;
      case 'pincode':
        this.filterPincode.set('');
        break;
      case 'countries':   this.onFilterCountryIdsChange([]); break;
      case 'state':       this.filterStateId.set(null); this.filterCityId.set(null); break;
      case 'city':        this.filterCityId.set(null); break;
      case 'visibility':  this.filterVisibility.set(''); break;
      case 'openNow':     this.filterOpenNow.set(false); break;
      case 'openOnDay':   this.filterOpenOnDay.set(null); break;
      case 'categories':  this.filterCategoryIds.set([]); break;
      case 'hasMenu':     this.filterHasMenu.set(false); break;
      case 'hasGallery':  this.filterHasGallery.set(false); break;
      case 'hasWhatsapp': this.filterHasWhatsapp.set(false); break;
      case 'hasWebsite':  this.filterHasWebsite.set(false); break;
      case 'status':
        this.filterStatus.set('');
        break;
      case 'dateFrom':
        this.filterDateFrom.set('');
        break;
      case 'dateTo':
        this.filterDateTo.set('');
        break;
    }
    if (filterKey === 'dateFrom' || filterKey === 'dateTo') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  setStatusFilter(v: string | number): void {
    this.filterStatus.set(v as 'active' | 'inactive' | '');
    this.applyFilters();
  }

  /** Stat-card variant — toggles off on a repeat click of the same status. */
  setStatusStatFilter(v: 'active' | 'inactive'): void {
    this.setStatusFilter(this.filterStatus() === v ? '' : v);
  }

  // ── Location filter (cascading, id-based) ──
  onFilterCountryIdsChange(ids: (string | number)[]): void {
    const next = ids.map(Number).filter(n => Number.isInteger(n));
    this.filterCountryIds.set(next);
    // State/City belong to a single country — changing the country set
    // invalidates whatever was chosen below it.
    this.filterStateId.set(null);
    this.filterCityId.set(null);
    this.divisionOptions.set([]);
    if (next.length === 1) this.loadDivisions(next[0]);
    this.applyFilters();
  }

  private loadDivisions(countryId: number): void {
    this.geographyService.getDivisions(countryId).subscribe({
      next: (list) => this.divisionOptions.set(list),
      error: () => this.divisionOptions.set([]),
    });
  }

  /** Countries for the id-based Location filter's cascading dropdowns. */
  loadGeoCountries(): void {
    this.geographyService.getCountries().subscribe({
      next: (list) => this.geoCountries.set(list),
      error: () => {},
    });
  }

  onFilterStateChange(value: string | number | null): void {
    this.filterStateId.set(value ? Number(value) : null);
    this.filterCityId.set(null);
    this.applyFilters();
  }

  onFilterCityChange(value: string | number | null): void {
    this.filterCityId.set(value ? Number(value) : null);
    this.applyFilters();
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
    this.applyFilters();
  }

  toggleOpenNow(): void {
    this.filterOpenNow.update(v => !v);
    this.applyFilters();
  }

  toggleOpenOnDay(day: OpeningDayKey): void {
    this.filterOpenOnDay.update(d => (d === day ? null : day));
    this.applyFilters();
  }

  onFilterCategoryIdsChange(ids: (string | number)[]): void {
    this.filterCategoryIds.set(ids.map(String));
    this.applyFilters();
  }

  toggleFeatureFilter(key: 'menu' | 'gallery' | 'whatsapp' | 'website'): void {
    const sig = {
      menu: this.filterHasMenu, gallery: this.filterHasGallery,
      whatsapp: this.filterHasWhatsapp, website: this.filterHasWebsite,
    }[key];
    sig.update(v => !v);
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

  /** Fills From/To Date with a preset range (mirrors admin-community's quick date presets). */
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
    this.currentPage.set(1);
    if (this.currentView() === 'list') this.loadBusinesses(this.selectedCategory());
  }

  clearAllFilters(): void {
    this.filterSearch.set('');
    this.filterCountry.set(null);
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
    this.filterStatus.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.showAdvancedFilters.set(false);
    if (this.currentView() === 'list') this.loadBusinesses(this.selectedCategory(), true);
  }

  clearFilters(): void {
    this.clearAllFilters();
  }

  // Navigation — step back through browser history rather than jumping
  // straight to the target view, so the physical Back button retraces the
  // same steps (categories → list → detail) instead of skipping past them.
  goToCategories(): void {
    const steps = this.currentView() === 'detail' ? 2 : this.currentView() === 'list' ? 1 : 0;
    if (steps > 0) history.go(-steps);
  }

  goToList(): void {
    if (this.currentView() === 'detail') history.go(-1);
  }

  // Category CRUD
  openAddCategory(): void {
    this.editingCategory.set(null);
    this.iconPickerOpen.set(false);
    this.iconSearch.set('');
    this.categoryForm.reset({ name: '', icon: 'bi-shop', description: '' });
    this.showAddCategoryModal.set(true);
  }

  openEditCategory(event: Event, cat: BusinessCategory): void {
    event.stopPropagation();
    this.editingCategory.set(cat);
    this.iconPickerOpen.set(false);
    this.iconSearch.set('');
    this.categoryForm.patchValue({ name: cat.name, icon: cat.icon ?? 'bi-shop', description: (cat as any).description ?? '' });
    this.showAddCategoryModal.set(true);
  }

  selectCategoryIcon(icon: string): void {
    this.categoryForm.get('icon')!.setValue(icon);
    this.iconPickerOpen.set(false);
  }

  closeAddCategory(): void {
    this.showAddCategoryModal.set(false);
    this.editingCategory.set(null);
  }

  submitCategory(): void {
    if (this.categoryForm.invalid) { this.categoryForm.markAllAsTouched(); return; }
    this.submitting.set(true);
    const editing = this.editingCategory();

    const req = editing
      ? this.businessService.updateCategory(editing.id, this.categoryForm.value)
      : this.businessService.createCategory(this.categoryForm.value);

    req.subscribe({
      next: (cat) => {
        if (editing) {
          this.categories.update(list => list.map(c => c.id === cat.id ? cat : c));
          this.toast.success('admin.business.toast.categoryUpdated');
        } else {
          this.categories.update(cats => [...cats, cat]);
          this.toast.success('admin.business.toast.categoryCreatedSuccessfully');
        }
        this.closeAddCategory();
        this.submitting.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to save category');
        this.submitting.set(false);
      },
    });
  }

  openDeleteCategory(event: Event, cat: BusinessCategory): void {
    event.stopPropagation();
    this.categoryToDelete.set(cat);
    this.showDeleteCategoryConfirm.set(true);
  }

  closeDeleteCategory(): void {
    this.showDeleteCategoryConfirm.set(false);
    this.categoryToDelete.set(null);
  }

  confirmDeleteCategory(): void {
    const cat = this.categoryToDelete();
    if (!cat) return;
    this.deletingCategoryId.set(cat.id);
    this.businessService.deleteCategory(cat.id).subscribe({
      next: () => {
        this.categories.update(list => list.filter(c => c.id !== cat.id));
        this.toast.success('admin.business.toast.categoryDeleted');
        this.closeDeleteCategory();
        this.deletingCategoryId.set(null);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to delete category');
        this.deletingCategoryId.set(null);
      },
    });
  }

  // ── Business CRUD ──
  // The Add/Edit form itself is app-business-form-modal (shared with the
  // user Business page and the profile "My Businesses" tab), so this page
  // only owns *which* business is being edited and what to do once it saves.
  openAddBusiness(): void {
    this.editBusinessId.set(null);
    this.showAddBusinessModal.set(true);
  }

  openEditBusiness(event: Event, biz: Business): void {
    event.stopPropagation();
    // No prefetch here: the modal loads the full record itself, including
    // the `stateChain` the list endpoint doesn't return.
    this.editBusinessId.set(biz.id);
    this.showAddBusinessModal.set(true);
  }

  closeAddBusiness(): void {
    this.showAddBusinessModal.set(false);
    this.editBusinessId.set(null);
  }

  onBusinessSaved(biz: Business): void {
    const wasEditing = this.editBusinessId() !== null;
    if (wasEditing && this.selectedBusiness()?.id === biz.id) this.selectedBusiness.set(biz);

    // Refetch from the server instead of splicing the new/edited item into
    // the local array — a local splice left pagination totals, the active
    // sort order, and any active filters stale (e.g. creating in one
    // category then switching to another showed outdated counts/lists).
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat, !wasEditing, false, true);
    // Keeps each category card's business count fresh on the Categories view.
    this.loadCategories(true);
  }

  openDeleteBusiness(event: Event, biz: Business): void {
    event.stopPropagation();
    this.businessToDelete.set(biz);
    this.showDeleteBusinessConfirm.set(true);
  }

  closeDeleteBusiness(): void {
    this.showDeleteBusinessConfirm.set(false);
    this.businessToDelete.set(null);
  }

  confirmDeleteBusiness(): void {
    const biz = this.businessToDelete();
    if (!biz) return;
    this.deletingId.set(biz.id);
    this.businessService.deleteBusiness(biz.id).subscribe({
      next: () => {
        this.toast.success('admin.business.toast.businessDeleted');
        this.closeDeleteBusiness();
        this.deletingId.set(null);
        // Refetch instead of splicing locally — keeps pagination totals and
        // Categories view counts accurate (see submitBusiness for the same fix).
        // From the detail view, goToList() already reloads the list itself
        // (via the popstate handler), so only refetch explicitly otherwise.
        if (this.currentView() === 'detail') {
          this.goToList();
        } else {
          const cat = this.selectedCategory();
          if (cat) this.loadBusinesses(cat, false, false, true);
        }
        this.loadCategories(true);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to delete business');
        this.deletingId.set(null);
      },
    });
  }

  deleteBusiness(event: Event, id: string): void {
    // kept for any residual HTML references — delegates to modal flow
    const biz = this.businesses().find(b => b.id === id) ?? this.selectedBusiness();
    if (biz) this.openDeleteBusiness(event, biz);
  }

  getLocation(biz: any): string {
  return [biz.city, biz.state]
    .filter(v => !!v)
    .join(', ') || biz.address;
  }

  isOpeningDay(openingDays: string | undefined, day: string): boolean {
  if (!openingDays) {
    return false;
  }

  return openingDays
    .split(',')
    .some(x => x.trim().toLowerCase().startsWith(day.toLowerCase()));
  }
  
  // Image lightbox — mirrors community-detail.component's openImagePreview /
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

  // Pagination
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat);
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

  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }

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

  getCategoryIcon(icon?: string): string {
    return icon || 'bi-shop';
  }

  getIconStyle(icon?: string): { bgColor: string; iconColor: string } {
    const iconName = icon || 'bi-shop';
    const found = this.categoryIcons.find(item => item.icon === iconName);
    return found ? { bgColor: found.bgColor, iconColor: found.iconColor } : { bgColor: '#f0f0f0', iconColor: '#333' };
  }

  getWhatsappUrl(number: string): string {
    return 'https://wa.me/' + number.replace(/\D/g, '');
  }

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

  getDirectionsUrl(): string {
    const biz = this.selectedBusiness();
    if (!biz) return '#';
    if (biz.latitude && biz.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${biz.latitude},${biz.longitude}`;
    }
    if (biz.address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address)}`;
    }
    return '#';
  }

  /**
   * Get fallback image URLs for a business (remaining images after the first one)
   */
  getBusinessFallbackImages(business: Business): string[] {
    return business.images && business.images.length > 1
      ? business.images.slice(1)
      : [];
  }
}