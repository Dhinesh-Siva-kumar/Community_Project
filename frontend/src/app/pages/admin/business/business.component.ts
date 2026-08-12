import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subject, takeUntil, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService, MasterState, MasterCity } from '../../../core/services/master-data.service';
import { Business, BusinessCategory, PaginatedResponse, Country } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { TruncatedDirective } from '../../../shared/directives/truncated.directive';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { getPhoneRule } from '../../../shared/utils/phone';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';

// Remembers the last selected category view mode (grid/list) across navigations.
const CAT_VIEW_STORAGE_KEY = 'admin-business:viewMode';
// Remembers the last selected business-list view mode (grid/table) across navigations.
const LIST_VIEW_STORAGE_KEY = 'admin-business:listViewMode';

function urlValidator(c: AbstractControl): ValidationErrors | null {
  const v = c.value;
  if (!v) return null;
  try { const u = new URL(v); return (u.protocol === 'http:' || u.protocol === 'https:') ? null : { invalidUrl: true }; }
  catch { return { invalidUrl: true }; }
}

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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SearchableSelectComponent, FileUploadComponent, ImageErrorHandlerDirective, TruncatedDirective, ImageUrlPipe, SortBarComponent],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
})
export class AdminBusinessComponent implements OnInit, OnDestroy {
  private businessService   = inject(BusinessService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private masterDataService = inject(MasterDataService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  // ── Countries for filter dropdown ──────────────────────────
  filterCountryOptions: SelectOption[] = [];
  filterOpeningHoursOptions: SelectOption[] = [
    { value: '9-5',  label: '9 AM - 5 PM' },
    { value: '24/7', label: '24/7' },
  ];

  // View state
  currentView = signal<ViewState>('categories');

  // Floating header action (shows once scrolled past the page header)
  showHeaderFab = signal(false);
  private scrollTicking = false;

  // Body-scroll lock while any modal/confirm popup is open
  private previousBodyOverflow: string | null = null;
  private previousHtmlOverflow: string | null = null;

  // Data
  categories = signal<BusinessCategory[]>([]);
  businesses = signal<Business[]>([]);
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);

  // Computed options for the category dropdown
  categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.id, label: c.name }))
  );

  // Loading
  loading = signal(true);
  submitting = signal(false);
  deletingId = signal<string | null>(null);

  // Gates the "Business logo is required" error until the admin actually
  // tries to submit — matches the Community page's image-required pattern.
  businessSubmitAttempted = signal(false);

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalItems = signal(0);

  // Modals
  showAddBusinessModal = signal(false);
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

  // Image carousel
  activeImageIndex = signal(0);

  // Image upload
  selectedImages = signal<File[]>([]);
  fileUploadReset = signal(0);

  // Logo
  selectedLogo    = signal<File | null>(null);
  logoPreview     = signal<string | null>(null);
  logoUploadReset = signal(0);

  // Address cascade for business form
  bizCountries     = signal<Country[]>([]);
  bizStates        = signal<MasterState[]>([]);
  bizCities        = signal<MasterCity[]>([]);
  bizStatesLoading = signal(false);
  bizCitiesLoading = signal(false);

  bizCountryOptions = computed<SelectOption[]>(() =>
    this.bizCountries().map(c => ({ value: String((c as any).id), label: `${(c as any).flag_emoji ?? ''} ${c.name}`.trim() }))
  );
  bizStateOptions = computed<SelectOption[]>(() =>
    this.bizStates().map(s => ({ value: String(s.id), label: s.name }))
  );
  bizCityOptions = computed<SelectOption[]>(() =>
    this.bizCities().map(c => ({ value: c.name, label: c.name }))
  );

  // Auto-generated maps link tracking
  mapsLinkAutoGenerated = signal(false);
  // True once the admin has typed/loaded their own non-empty Google Maps
  // link — location-field changes then stop auto-overwriting it. Goes back
  // to false if the field is cleared, so auto-generation resumes.
  mapsLinkUserEdited = signal(false);

  // Opening days
  readonly DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  selectedDays = signal<string[]>([]);

  // Opening hours time pickers
  openingHoursTouched = signal(false);

  // Custom time dropdown state
  timeDropdownOpen = signal<'from' | 'to' | null>(null);

  /** Generate time options in 30-min intervals: 00:00, 00:30, 01:00 ... 23:30 */
  readonly TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2, '0')}:${m}`;
  });

  /** Display a time value in a user-friendly 12h format for the trigger button */
  displayTime(time24: string): string {
    if (!time24) return 'Select';
    const [h, m] = time24.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 'Select';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  openTimeDropdown(type: 'from' | 'to'): void {
    this.timeDropdownOpen.set(type);
  }

  closeTimeDropdown(): void {
    this.timeDropdownOpen.set(null);
  }

  selectTime(type: 'from' | 'to', value: string): void {
    this.businessForm.get(type === 'from' ? 'openingHoursFrom' : 'openingHoursTo')?.setValue(value);
    this.closeTimeDropdown();
    this.markOpeningHoursTouched();
  }

  markOpeningHoursTouched(): void {
    this.openingHoursTouched.set(true);
  }

  /** Convert "09:00" (24h) → "9:00 AM" (12h) */
  private formatTo12h(time24: string): string {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  /** Parse "9:00 AM" (12h) → "09:00" (24h) */
  private parseTo24h(time12: string): string {
    if (!time12) return '';
    const cleaned = time12.trim().toUpperCase();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!match) return '';
    let h = parseInt(match[1], 10);
    const m = match[2];
    const p = match[3];
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  /** Parse existing openingHours string into from/to and set the form */
  private parseOpeningHoursToForm(hours: string): void {
    if (!hours) return;
    // Try "9:00 AM – 5:00 PM" pattern
    const dashMatch = hours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (dashMatch) {
      const from = this.parseTo24h(dashMatch[1].trim());
      const to   = this.parseTo24h(dashMatch[2].trim());
      if (from) this.businessForm.get('openingHoursFrom')?.setValue(from);
      if (to)   this.businessForm.get('openingHoursTo')?.setValue(to);
      return;
    }
    // Try "9:00 AM - 5:00 PM" with regular hyphen
    const hyphenMatch = hours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (hyphenMatch) {
      const from = this.parseTo24h(hyphenMatch[1].trim());
      const to   = this.parseTo24h(hyphenMatch[2].trim());
      if (from) this.businessForm.get('openingHoursFrom')?.setValue(from);
      if (to)   this.businessForm.get('openingHoursTo')?.setValue(to);
    }
  }
  toggleDay(day: string): void {
    this.selectedDays.update(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day]);
    const ctrl = this.businessForm.get('openingDays');
    ctrl?.setValue(this.selectedDays().join(','));
    ctrl?.markAsTouched();
    ctrl?.updateValueAndValidity();
  }

  // Business edit/delete modals
  editingBusiness       = signal<Business | null>(null);
  showDeleteBusinessConfirm = signal(false);
  businessToDelete      = signal<Business | null>(null);

  // ── Phone country for Contact section (dial‑code dropdown) ──
  phoneCountries = signal<Country[]>([]);
  phoneCountryOptions = computed<SelectOption[]>(() =>
    this.phoneCountries().map(c => ({
      value: c.id,
      label: `${c.flag_emoji || ''} ${c.dial_code}`.trim(),
    }))
  );

  // ── "Same as phone" checkbox for WhatsApp ──
  sameAsPhone = signal(false);

  // Icon configuration for category modal
  categoryIcons = [
    { icon: 'bi-shop', bgColor: '#fff4e6', iconColor: '#ff9500', label: 'Retail' },
    { icon: 'bi-cup', bgColor: '#fff3cd', iconColor: '#ff8c00', label: 'Restaurants' },
    { icon: 'bi-hospital', bgColor: '#ffe5e5', iconColor: '#e74c3c', label: 'Healthcare' },
    { icon: 'bi-tools', bgColor: '#e0f7f4', iconColor: '#17a2b8', label: 'Services' },
    { icon: 'bi-laptop', bgColor: '#f3e5f5', iconColor: '#7b3ff2', label: 'Technology' },
    { icon: 'bi-palette', bgColor: '#fce4ec', iconColor: '#e91e63', label: 'Design' },
    { icon: 'bi-book', bgColor: '#e3f2fd', iconColor: '#2196f3', label: 'Education' },
    { icon: 'bi-briefcase', bgColor: '#e8eaf6', iconColor: '#3f51b5', label: 'Business' },
    { icon: 'bi-house', bgColor: '#e8f5e9', iconColor: '#4caf50', label: 'Real Estate' },
    { icon: 'bi-car-front', bgColor: '#ecf0f1', iconColor: '#34495e', label: 'Automotive' },
  ];

  // Advanced filters - match admin-community pattern
  filterSearch = signal('');
  filterCountry = signal<string | null>(null);
  filterPincode = signal('');
  filterOpeningHours = signal<string | null>(null);
  filterStatus = signal<'active' | 'inactive' | ''>('');
  filterDateFrom = signal('');
  filterDateTo = signal('');
  activeQuickRange = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters = signal(false);

  // ── Business list view mode (grid/table) ────────────────────
  listViewMode = signal<'grid' | 'table'>('grid');

  readonly statusFilterOptions: SelectOption[] = [
    { value: '',         label: 'All Status' },
    { value: 'active',   label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize = signal(20);

  // ── Sort — driven by the sort-bar above the grid ────────────
  readonly sortFields: SortField[] = [
    { key: 'name',   label: 'Name' },
    { key: 'joined', label: 'Created' },
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

  hasActiveFilters = computed(() =>
    !!(this.filterSearch() || this.filterCountry() || this.filterPincode() || this.filterOpeningHours()
      || this.filterStatus() || this.filterDateFrom() || this.filterDateTo())
  );

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterSearch()) count++;
    if (this.filterCountry()) count++;
    if (this.filterPincode()) count++;
    if (this.filterOpeningHours()) count++;
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

  // Grid-view sort — same pill-style sort-bar as the community grid, shown
  // above the grid only (the table view sorts via its own column headers).
  readonly catSortFields: SortField[] = [
    { key: 'name',  label: 'Name' },
    { key: 'count', label: 'Businesses' },
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
    this.initForms();
    this.loadCountries();
    this.loadCategories();
    this.loadMasterCountries();
    this.loadPhoneCountries();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.unlockPageScroll();
  }

  /** Locks background scroll while a modal/confirm popup is open. */
  private lockPageScroll(): void {
    const body = document.body;
    const html = document.documentElement;

    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = body.style.overflow;
    }
    if (this.previousHtmlOverflow === null) {
      this.previousHtmlOverflow = html.style.overflow;
    }

    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }

  private unlockPageScroll(): void {
    const body = document.body;
    const html = document.documentElement;

    body.style.overflow = this.previousBodyOverflow ?? '';
    html.style.overflow = this.previousHtmlOverflow ?? '';

    this.previousBodyOverflow = null;
    this.previousHtmlOverflow = null;
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
    if (state?.view === 'detail' && state.business) {
      if (state.category) this.selectedCategory.set(state.category);
      this.selectedBusiness.set(state.business);
      this.activeImageIndex.set(0);
      this.currentView.set('detail');
      return;
    }

    if (state?.view === 'list' && state.category) {
      this.selectedBusiness.set(null);
      this.loadBusinesses(state.category, true, false);
      return;
    }

    // Fallback: categories view (also covers the initial entry, whose state is null).
    this.currentView.set('categories');
    this.selectedCategory.set(null);
    this.selectedBusiness.set(null);
    this.businesses.set([]);
    this.currentPage.set(1);
    this.filterSearch.set('');
    this.filterCountry.set(null);
    this.filterPincode.set('');
    this.filterOpeningHours.set(null);
    this.filterStatus.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
  }

  // ── Phone countries (dial‑code dropdown) ────────────────────

  loadPhoneCountries(): void {
    this.authService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.phoneCountries.set(res.data);
        // Default to India (+91) if available — for both Phone and WhatsApp.
        const india = res.data.find((c: Country) => c.name === 'India');
        if (india) {
          const patch: Record<string, unknown> = {};
          if (!this.businessForm.get('phoneCountryId')?.value) patch['phoneCountryId'] = india.id;
          if (!this.businessForm.get('whatsappCountryId')?.value) patch['whatsappCountryId'] = india.id;
          if (Object.keys(patch).length) {
            this.businessForm.patchValue(patch);
            this.businessForm.get('phone')?.updateValueAndValidity();
            this.businessForm.get('whatsapp')?.updateValueAndValidity();
          }
        }
      },
      error: () => {},
    });
  }

  /**
   * Splits a stored "<dial_code> <digits>" value (or legacy bare-digits) into
   * the matching phoneCountries() id + local digits, so edit forms show clean
   * digits in the number field instead of a leading country code.
   */
  private splitPhoneValue(value: string | undefined | null): { countryId: number | null; digits: string } {
    const raw = (value ?? '').trim();
    if (!raw) return { countryId: null, digits: '' };
    const withoutPlus = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
    // Longest dial code first so e.g. +971 isn't mis-matched by a shorter +1/+91 prefix.
    const countries = [...this.phoneCountries()].sort((a, b) => b.dial_code.length - a.dial_code.length);
    for (const c of countries) {
      const dial = c.dial_code.replace(/\D/g, '');
      if (dial && withoutPlus.startsWith(dial)) {
        return { countryId: c.id, digits: withoutPlus.slice(dial.length) };
      }
    }
    return { countryId: null, digits: withoutPlus };
  }

  // ── Phone validator (country‑aware) ─────────────────────────

  phoneValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const digits = (control.value ?? '').replace(/\D/g, '');
      if (!digits) return null;

      const parent = control.parent;
      if (!parent || !this.phoneCountries().length) return null;

      const countryId = parent.get('phoneCountryId')?.value;
      if (!countryId) return null;

      const country = this.phoneCountries().find(c => c.id == countryId);
      if (!country) return null;

      const rule  = getPhoneRule(country.dial_code);
      const valid =
        digits.length >= rule.minLen &&
        digits.length <= rule.maxLen &&
        (rule.pattern ? rule.pattern.test(digits) : true);

      return valid ? null : { phoneInvalid: rule.hint };
    };
  }

  // ── WhatsApp validator (country‑aware) — uses the Phone country when
  // "same as phone" is checked, otherwise the dedicated WhatsApp country. ──

  whatsappValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const digits = (control.value ?? '').replace(/\D/g, '');
      if (!digits) return null;

      const parent = control.parent;
      if (!parent || !this.phoneCountries().length) return null;

      const countryId = this.sameAsPhone()
        ? parent.get('phoneCountryId')?.value
        : parent.get('whatsappCountryId')?.value;
      if (!countryId) return null;

      const country = this.phoneCountries().find(c => c.id == countryId);
      if (!country) return null;

      const rule  = getPhoneRule(country.dial_code);
      const valid =
        digits.length >= rule.minLen &&
        digits.length <= rule.maxLen &&
        (rule.pattern ? rule.pattern.test(digits) : true);

      return valid ? null : { phoneInvalid: rule.hint };
    };
  }

  loadMasterCountries(): void {
    this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.bizCountries.set(data),
      error: () => {},
    });
  }

  onBizCountryChange(countryId: any): void {
    this.businessForm.get('stateId')?.setValue(null);
    this.businessForm.get('city')?.setValue(null);
    this.bizStates.set([]); this.bizCities.set([]);
    if (countryId) {
      this.bizStatesLoading.set(true);
      this.masterDataService.getStates(Number(countryId)).pipe(takeUntil(this.destroy$)).subscribe({
        next: s => { this.bizStates.set(s); this.bizStatesLoading.set(false); },
        error: () => this.bizStatesLoading.set(false),
      });
    }
  }

  onBizStateChange(stateId: any): void {
    this.businessForm.get('city')?.setValue(null);
    this.bizCities.set([]);
    if (stateId) {
      this.bizCitiesLoading.set(true);
      this.masterDataService.getCities(Number(stateId)).pipe(takeUntil(this.destroy$)).subscribe({
        next: c => { this.bizCities.set(c); this.bizCitiesLoading.set(false); },
        error: () => this.bizCitiesLoading.set(false),
      });
    }
  }

  onLogoChange(files: File[]): void {
    const f = files[0] ?? null;
    this.selectedLogo.set(f);
    if (f) { const r = new FileReader(); r.onload = e => this.logoPreview.set(e.target?.result as string); r.readAsDataURL(f); }
    else { this.logoPreview.set(null); }
  }

  clearLogo(): void {
    this.selectedLogo.set(null); this.logoPreview.set(null);
    this.logoUploadReset.update(v => v + 1);
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({
          value: c.name,
          label: c.name,
        }));
      },
      error: () => this.toast.error('Failed to load countries'),
    });
  }

private initForms(): void {
    this.businessForm = this.fb.group({
      name:         ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      description:  ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
      categoryId:   ['', Validators.required],
      countryId:    [null, Validators.required],
      stateId:      [null, Validators.required],
      city:         ['', Validators.required],
      address:      ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
      pincode:      ['', [Validators.required, Validators.pattern(/^\S{3,12}$/)]],
      phoneCountryId: [null, Validators.required],
      phone:        ['', [Validators.required, Validators.maxLength(15), this.phoneValidator()]],
      openingDays:  ['', Validators.required],
      openingHours: ['', Validators.required],
      openingHoursFrom: ['09:00'],
      openingHoursTo: ['17:00'],
      email:        ['', [Validators.email, Validators.maxLength(255)]],
      website:      ['', [urlValidator, Validators.maxLength(500)]],
      sameAsPhone:  [false],
      whatsappCountryId: [null],
      whatsapp:     ['', [Validators.maxLength(15), this.whatsappValidator()]],
      mapsLink:     ['', [urlValidator, Validators.maxLength(2000)]],
      country:      [''],
      latitude:     [''],
      longitude:    [''],
    });

    this.categoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      icon: ['bi-shop', Validators.required],
      description: ['', [Validators.maxLength(300)]],
    });

    this.setupMapsLinkAutoGeneration();
    this.setupOpeningHoursSync();

    // Re-run phone validation whenever the phone country changes — also
    // revalidates WhatsApp, since it uses the phone country when "same as
    // phone" is checked.
    this.businessForm.get('phoneCountryId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.businessForm.get('phone')?.updateValueAndValidity();
        this.businessForm.get('whatsapp')?.updateValueAndValidity();
      });

    // Re-run WhatsApp validation whenever its own country changes.
    this.businessForm.get('whatsappCountryId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.businessForm.get('whatsapp')?.updateValueAndValidity());

    // ── "Same as phone" checkbox logic ──────────────────────────
    this.businessForm.get('sameAsPhone')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((checked: boolean) => {
        this.sameAsPhone.set(checked);
        const phoneCtrl = this.businessForm.get('phone');
        const waCtrl    = this.businessForm.get('whatsapp');
        if (checked) {
          // Copy phone value to whatsapp (digits only, no country code shown
          // in the field — the WhatsApp country dropdown is hidden and the
          // phone country is used instead) and disable the field.
          waCtrl?.setValue(phoneCtrl?.value ?? '');
          waCtrl?.disable();
        } else {
          waCtrl?.enable();
          waCtrl?.updateValueAndValidity();
        }
      });

    // When phone changes and checkbox is checked, keep whatsapp in sync
    this.businessForm.get('phone')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        if (this.sameAsPhone()) {
          this.businessForm.get('whatsapp')?.setValue(val ?? '');
        }
      });
  }

  private setupOpeningHoursSync(): void {
    // When either time picker changes, combine them into the openingHours string
    combineLatest([
      (this.businessForm.get('openingHoursFrom')?.valueChanges ?? new Subject()),
      (this.businessForm.get('openingHoursTo')?.valueChanges ?? new Subject()),
    ]).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const from = this.formatTo12h(this.businessForm.get('openingHoursFrom')?.value ?? '');
      const to   = this.formatTo12h(this.businessForm.get('openingHoursTo')?.value ?? '');
      if (from && to) {
        this.businessForm.get('openingHours')?.setValue(`${from} – ${to}`);
      } else {
        this.businessForm.get('openingHours')?.setValue('');
      }
    });
  }

  private setupMapsLinkAutoGeneration(): void {
    // Any real valueChanges on mapsLink (our own auto-set below always uses
    // {emitEvent:false}) means the admin typed it directly, or it was loaded
    // from an existing business — either way, treat it as "provided" and
    // stop auto-overwriting it. Clearing the field re-enables auto-generation.
    this.businessForm.get('mapsLink')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val: string) => {
        this.mapsLinkUserEdited.set(!!(val ?? '').trim());
        this.mapsLinkAutoGenerated.set(false);
      });

    const locationControls = [
      this.businessForm.get('address')!,
      this.businessForm.get('city')!,
      this.businessForm.get('stateId')!,
      this.businessForm.get('countryId')!,
      this.businessForm.get('pincode')!,
    ];

    combineLatest(locationControls.map(c => c.valueChanges))
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        // The admin already has a Google Maps link (typed or loaded from an
        // existing business) — don't clobber it just because an address field changed.
        if (this.mapsLinkUserEdited()) return;

        const address  = this.businessForm.get('address')?.value ?? '';
        const city     = this.businessForm.get('city')?.value ?? '';
        const stateId  = this.businessForm.get('stateId')?.value;
        const countryId = this.businessForm.get('countryId')?.value;
        const pincode  = this.businessForm.get('pincode')?.value ?? '';

        // Resolve state name from ID
        let stateName = '';
        if (stateId) {
          const found = this.bizStates().find(s => String(s.id) === String(stateId));
          if (found) stateName = found.name;
        }

        // Resolve country name from ID
        let countryName = '';
        if (countryId) {
          const found = this.bizCountries().find((c: any) => String(c.id) === String(countryId));
          if (found) countryName = (found as any).name;
        }

        const parts = [address, city, stateName, countryName, pincode].filter((v: string) => !!v.trim());
        if (parts.length > 0) {
          const query = parts.join(', ');
          const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
          this.businessForm.get('mapsLink')?.setValue(mapsUrl, { emitEvent: false });
          this.mapsLinkAutoGenerated.set(true);
        } else {
          this.mapsLinkAutoGenerated.set(false);
        }
      });
  }

  loadCategories(): void {
    this.loading.set(true);
    this.businessService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load categories');
        this.loading.set(false);
      },
    });
  }

  loadBusinesses(category: BusinessCategory, resetPage = false, pushHistory = false): void {
    this.selectedCategory.set(category);
    this.currentView.set('list');
    if (resetPage) this.currentPage.set(1);
    if (pushHistory) {
      history.pushState({ view: 'list', category } satisfies BusinessNavState, '');
    }
    this.loading.set(true);

    const params: Record<string, any> = {
      categoryId: category.id,
      page: this.currentPage(),
      limit: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    if (this.filterSearch()) params['search'] = this.filterSearch();
    if (this.filterCountry()) params['country'] = this.filterCountry();
    if (this.filterPincode()) params['pincode'] = this.filterPincode();
    if (this.filterOpeningHours()) params['openingHours'] = this.filterOpeningHours();
    if (this.filterStatus()) params['status'] = this.filterStatus();
    if (this.filterDateFrom()) params['dateFrom'] = this.filterDateFrom();
    if (this.filterDateTo()) params['dateTo'] = this.filterDateTo();

    this.businessService.getBusinesses(params).subscribe({
      next: (response: PaginatedResponse<Business>) => {
        // The current page may no longer exist (e.g. the last item on the last
        // page was deleted) — fall back to the last valid page.
        if (response.totalPages > 0 && this.currentPage() > response.totalPages) {
          this.currentPage.set(response.totalPages);
          this.loadBusinesses(category);
          return;
        }
        this.businesses.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load businesses');
        this.loading.set(false);
      },
    });
  }

  loadBusinessDetail(business: Business): void {
    this.selectedBusiness.set(business);
    this.activeImageIndex.set(0);
    this.currentView.set('detail');
    history.pushState({ view: 'detail', category: this.selectedCategory() ?? undefined, business } satisfies BusinessNavState, '');
  }

  applyFilters(): void {
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat, true);
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
  }

  removeFilter(filterKey: 'search' | 'country' | 'pincode' | 'hours' | 'status' | 'dateFrom' | 'dateTo'): void {
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
      case 'hours':
        this.filterOpeningHours.set(null);
        break;
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

  onFilterOpeningHoursChange(value: string | null): void {
    this.filterOpeningHours.set(value);
    this.applyFilters();
  }

  onFilterDateFromChange(e: Event): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onFilterDateToChange(e: Event): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set((e.target as HTMLInputElement).value);
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
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat);
  }

  clearAllFilters(): void {
    this.filterSearch.set('');
    this.filterCountry.set(null);
    this.filterPincode.set('');
    this.filterOpeningHours.set(null);
    this.filterStatus.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.showAdvancedFilters.set(false);
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat, true);
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
    this.lockPageScroll();
    this.showAddCategoryModal.set(true);
  }

  openEditCategory(event: Event, cat: BusinessCategory): void {
    event.stopPropagation();
    this.editingCategory.set(cat);
    this.iconPickerOpen.set(false);
    this.iconSearch.set('');
    this.categoryForm.patchValue({ name: cat.name, icon: cat.icon ?? 'bi-shop', description: (cat as any).description ?? '' });
    this.lockPageScroll();
    this.showAddCategoryModal.set(true);
  }

  selectCategoryIcon(icon: string): void {
    this.categoryForm.get('icon')!.setValue(icon);
    this.iconPickerOpen.set(false);
  }

  closeAddCategory(): void {
    this.showAddCategoryModal.set(false);
    this.editingCategory.set(null);
    this.unlockPageScroll();
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
          this.toast.success('Category updated');
        } else {
          this.categories.update(cats => [...cats, cat]);
          this.toast.success('Category created successfully');
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
    this.lockPageScroll();
    this.showDeleteCategoryConfirm.set(true);
  }

  closeDeleteCategory(): void {
    this.showDeleteCategoryConfirm.set(false);
    this.categoryToDelete.set(null);
    this.unlockPageScroll();
  }

  confirmDeleteCategory(): void {
    const cat = this.categoryToDelete();
    if (!cat) return;
    this.deletingCategoryId.set(cat.id);
    this.businessService.deleteCategory(cat.id).subscribe({
      next: () => {
        this.categories.update(list => list.filter(c => c.id !== cat.id));
        this.toast.success('Category deleted');
        this.closeDeleteCategory();
        this.deletingCategoryId.set(null);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to delete category');
        this.deletingCategoryId.set(null);
      },
    });
  }

  // Business CRUD
  openAddBusiness(): void {
    this.editingBusiness.set(null);
    this.businessForm.reset();
    this.businessSubmitAttempted.set(false);
    // Pre-fill the category with whichever category the admin is currently
    // browsing, instead of leaving it blank for them to pick again.
    const currentCategory = this.selectedCategory();
    if (currentCategory) this.businessForm.get('categoryId')?.setValue(currentCategory.id);
    // reset() clears phoneCountryId/whatsappCountryId — re-apply the India
    // default (loadPhoneCountries() only auto-fills them once, on first load).
    const india = this.phoneCountries().find(c => c.name === 'India');
    if (india) {
      this.businessForm.get('phoneCountryId')?.setValue(india.id);
      this.businessForm.get('whatsappCountryId')?.setValue(india.id);
    }
    this.selectedImages.set([]); this.selectedLogo.set(null); this.logoPreview.set(null);
    this.selectedDays.set([]);
    this.businessForm.get('openingDays')?.setValue('');
    this.bizStates.set([]); this.bizCities.set([]);
    this.fileUploadReset.update(v => v + 1); this.logoUploadReset.update(v => v + 1);
    this.openingHoursTouched.set(false);
    this.lockPageScroll();
    this.showAddBusinessModal.set(true);
  }

  openEditBusiness(event: Event, biz: Business): void {
    event.stopPropagation();
    this.editingBusiness.set(biz);
    this.businessSubmitAttempted.set(false);

    // Restore opening days
    const days = biz.openingDays ?? (biz as any).opening_days ?? '';
    const parsedDays = days ? days.split(',').map((d: string) => d.trim()).filter(Boolean) : [];
    this.selectedDays.set(parsedDays);

    // Patch all non-cascade, non-phone fields immediately (phone/WhatsApp
    // need phoneCountries() loaded first — handled separately below).
    this.businessForm.patchValue({
      name:         biz.name         ?? '',
      description:  biz.description  ?? '',
      categoryId:   biz.categoryId   ?? (biz as any).category_id ?? biz.category?.id ?? '',
      stateId:      null,
      city:         biz.city         ?? '',
      address:      biz.address      ?? '',
      pincode:      biz.pincode      ?? '',
      email:        biz.email        ?? '',
      website:      biz.website      ?? '',
      mapsLink:     biz.mapsLink     ?? (biz as any).maps_link ?? '',
      openingHours: biz.openingHours ?? (biz as any).opening_hours ?? '',
      openingDays:  parsedDays.join(','),
      country:      biz.country      ?? '',
      latitude:     biz.latitude     ?? '',
      longitude:    biz.longitude    ?? '',
    });

    // Phone/WhatsApp are stored as "<dial_code> <digits>" — split each back
    // into its country dropdown + clean local digits so the number fields
    // never display a country code. "Same as phone" is re-derived: it was
    // checked originally iff the two stored values are identical.
    const applyPhoneFields = () => {
      const phoneSplit = this.splitPhoneValue(biz.phone);
      const waSplit     = this.splitPhoneValue((biz as any).whatsapp);
      const wasSameAsPhone = !!biz.phone && !!(biz as any).whatsapp && (biz as any).whatsapp === biz.phone;
      this.businessForm.patchValue({
        phoneCountryId:    phoneSplit.countryId,
        phone:             phoneSplit.digits,
        whatsappCountryId: wasSameAsPhone ? null : waSplit.countryId,
        whatsapp:          wasSameAsPhone ? phoneSplit.digits : waSplit.digits,
        sameAsPhone:       wasSameAsPhone,
      });
    };
    if (this.phoneCountries().length > 0) {
      applyPhoneFields();
    } else {
      this.authService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => { this.phoneCountries.set(res.data); applyPhoneFields(); },
        error: () => {},
      });
    }

    // Parse existing openingHours into the time pickers
    this.parseOpeningHoursToForm(biz.openingHours ?? (biz as any).opening_hours ?? '');

    // Logo
    const logoUrl = biz.logo ?? (biz.images?.length ? biz.images[0] : null);
    this.selectedLogo.set(null);
    this.logoPreview.set(logoUrl ?? null);
    this.selectedImages.set([]);
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);

    // Country cascade — run now if countries loaded, else wait
    const doCountryCascade = () => {
      const countryName = biz.country ?? '';
      const matched = this.bizCountries().find((c: any) => c.name?.toLowerCase() === countryName.toLowerCase());
      if (!matched) return;
      const countryId = String((matched as any).id);
      this.businessForm.get('countryId')?.setValue(countryId);
      this.bizStates.set([]); this.bizCities.set([]);
      this.bizStatesLoading.set(true);
      this.masterDataService.getStates(Number(countryId)).pipe(takeUntil(this.destroy$)).subscribe({
        next: states => {
          this.bizStates.set(states);
          this.bizStatesLoading.set(false);
          const stateName = biz.state ?? '';
          const matchedState = states.find(s => s.name?.toLowerCase() === stateName.toLowerCase());
          if (!matchedState) return;
          this.businessForm.get('stateId')?.setValue(String(matchedState.id));
          this.bizCitiesLoading.set(true);
          this.masterDataService.getCities(matchedState.id).pipe(takeUntil(this.destroy$)).subscribe({
            next: cities => {
              this.bizCities.set(cities);
              this.bizCitiesLoading.set(false);
              this.businessForm.get('city')?.setValue(biz.city ?? '');
            },
            error: () => this.bizCitiesLoading.set(false),
          });
        },
        error: () => this.bizStatesLoading.set(false),
      });
    };

    if (this.bizCountries().length > 0) {
      doCountryCascade();
    } else {
      // Countries not yet loaded — wait for them
      this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
        next: data => { this.bizCountries.set(data); doCountryCascade(); },
        error: () => {},
      });
    }

    this.lockPageScroll();
    this.showAddBusinessModal.set(true);
  }

  closeAddBusiness(): void {
    this.showAddBusinessModal.set(false);
    this.editingBusiness.set(null);
    this.unlockPageScroll();
  }

  onBusinessImagesChange(files: File[]): void {
    this.selectedImages.set(files);
  }

  submitBusiness(): void {
    this.businessSubmitAttempted.set(true);
    this.businessForm.markAllAsTouched();
    // logoPreview() covers both cases: a freshly-selected file, or an
    // untouched existing logo when editing. It's only empty when the admin
    // never picked one (create) or explicitly cleared it (edit) without
    // choosing a replacement — either way, the logo is required.
    if (this.businessForm.invalid || !this.logoPreview()) { return; }
    this.submitting.set(true);
    // getRawValue() (not .value) — .value silently drops disabled controls,
    // and `whatsapp` is disabled while "same as phone" is checked, which
    // meant the synced WhatsApp number was never actually submitted.
    const raw: Record<string, any> = { ...this.businessForm.getRawValue() };

    // Resolve country name from selected countryId
    const foundCountry = this.bizCountries().find((c: any) => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = (foundCountry as any).name;

    // Resolve state name from selected stateId
    const foundState = this.bizStates().find(s => String(s.id) === String(raw['stateId']));
    if (foundState) raw['state'] = foundState.name;

    // Combine phone country dial code + local number for the phone field
    const phoneCountryId = raw['phoneCountryId'];
    if (phoneCountryId) {
      const phoneCountry = this.phoneCountries().find(c => c.id == phoneCountryId);
      if (phoneCountry) {
        const digits = (raw['phone'] ?? '').replace(/\D/g, '');
        raw['phone'] = `${phoneCountry.dial_code} ${digits}`;
      }
    }

    // Combine WhatsApp country dial code + local number for the WhatsApp
    // field (mirrors phone above) — uses the phone country when "same as
    // phone" is checked, otherwise the dedicated WhatsApp country dropdown.
    const waDigits = (raw['whatsapp'] ?? '').replace(/\D/g, '');
    if (waDigits) {
      const waCountryId = raw['sameAsPhone'] ? raw['phoneCountryId'] : raw['whatsappCountryId'];
      const waCountry = this.phoneCountries().find(c => c.id == waCountryId);
      raw['whatsapp'] = waCountry ? `${waCountry.dial_code} ${waDigits}` : waDigits;
    } else {
      raw['whatsapp'] = '';
    }

    // Opening days from signal (authoritative source)
    raw['openingDays'] = this.selectedDays().join(',');

    delete raw['countryId'];
    delete raw['stateId'];
    delete raw['phoneCountryId'];
    delete raw['whatsappCountryId'];
    delete raw['openingHoursFrom'];
    delete raw['openingHoursTo'];

     const images  = this.selectedImages();
     const logo    = this.selectedLogo();
     const editing = this.editingBusiness();
     const req = editing
       ? this.businessService.updateBusiness(editing.id, raw, images.length > 0 ? images : undefined, logo ?? undefined)
       : this.businessService.createBusiness(raw, images.length > 0 ? images : undefined, logo ?? undefined);

    req.subscribe({
      next: (biz) => {
        if (editing) {
          if (this.selectedBusiness()?.id === biz.id) this.selectedBusiness.set(biz);
          this.toast.success('Business updated successfully');
        } else {
          this.toast.success('Business created successfully');
        }
        this.closeAddBusiness();
        this.submitting.set(false);

        // Refetch from the server instead of splicing the new/edited item into
        // the local array — a local splice left pagination totals, the active
        // sort order, and any active filters stale (e.g. creating in one
        // category then switching to another showed outdated counts/lists).
        const cat = this.selectedCategory();
        if (cat) this.loadBusinesses(cat, !editing);
        // Keeps each category card's business count fresh on the Categories view.
        this.loadCategories();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? (editing ? 'Failed to update business' : 'Failed to create business'));
        this.submitting.set(false);
      },
    });
  }

  openDeleteBusiness(event: Event, biz: Business): void {
    event.stopPropagation();
    this.businessToDelete.set(biz);
    this.lockPageScroll();
    this.showDeleteBusinessConfirm.set(true);
  }

  closeDeleteBusiness(): void {
    this.showDeleteBusinessConfirm.set(false);
    this.businessToDelete.set(null);
    this.unlockPageScroll();
  }

  confirmDeleteBusiness(): void {
    const biz = this.businessToDelete();
    if (!biz) return;
    this.deletingId.set(biz.id);
    this.businessService.deleteBusiness(biz.id).subscribe({
      next: () => {
        this.toast.success('Business deleted');
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
          if (cat) this.loadBusinesses(cat);
        }
        this.loadCategories();
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
  
  // Image Carousel
  prevImage(): void {
    const images = this.selectedBusiness()?.images ?? [];
    if (images.length === 0) return;
    this.activeImageIndex.update((i) => (i === 0 ? images.length - 1 : i - 1));
  }

  nextImage(): void {
    const images = this.selectedBusiness()?.images ?? [];
    if (images.length === 0) return;
    this.activeImageIndex.update((i) => (i === images.length - 1 ? 0 : i + 1));
  }

  setActiveImage(index: number): void {
    this.activeImageIndex.set(index);
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