import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subject, takeUntil, Observable, map } from 'rxjs';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { Business, BusinessCategory, PaginatedResponse, Country, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';

function urlValidator(c: AbstractControl): ValidationErrors | null {
  const v = c.value;
  if (!v) return null;
  try { const u = new URL(v); return (u.protocol === 'http:' || u.protocol === 'https:') ? null : { invalidUrl: true }; }
  catch { return { invalidUrl: true }; }
}

/** Country-aware postal code validator — see admin business.component.ts for the fuller explanation. */
function postalCodeValidator(regex: string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v || !regex) return null;
    try { return new RegExp(regex).test(v) ? null : { postalFormat: true }; }
    catch { return null; }
  };
}

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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, FileUploadComponent, ImageUrlPipe, InfiniteScrollDirective],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
})
export class UserBusinessComponent implements OnInit, OnDestroy {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private geographyService  = inject(GeographyService);

  // Body-scroll lock while the image lightbox is open — mirrors the Admin
  // Business page's implementation.
  private previousBodyOverflow: string | null = null;
  private previousHtmlOverflow: string | null = null;
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  // ── View state ──────────────────────────────────────────────
  currentView      = signal<ViewState>('list');
  /** 'list' = Business List view, 'categories' = Category browse view */
  businessView     = signal<'list' | 'categories'>('list');

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
    { value: '9-5',  label: '9 AM - 5 PM' },
    { value: '24/7', label: '24/7' },
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
    return [{ value: '', label: 'All Categories' }, ...cats];
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
    { value: 'name',   label: 'Name A–Z' },
    { value: 'count',  label: 'Most Businesses' },
    { value: 'newest', label: 'Newest First' },
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

  // ── Add Business Modal ──────────────────────────────────────
  showAddBusinessModal = signal(false);
  editingBusiness      = signal<Business | null>(null);
  submitting           = signal(false);

  // Image / Logo
  selectedImages   = signal<File[]>([]);
  fileUploadReset  = signal(0);
  selectedLogo     = signal<File | null>(null);
  logoPreview      = signal<string | null>(null);
  logoUploadReset  = signal(0);

  // ── Country-aware address hierarchy (Country → Division(s) → City → Postal) ──
  // Mirrors the admin Business form's implementation — see
  // pages/admin/business/business.component.ts for the fuller explanation.
  geoCountries  = signal<GeoCountry[]>([]);
  countryConfig = signal<CountryAddressConfig | null>(null);
  adminLevels   = computed(() => this.countryConfig()?.divisionLevels ?? []);

  geoCountryOptions = computed<SelectOption[]>(() =>
    this.geoCountries().map(c => ({ value: c.id, label: `${c.flagEmoji ?? ''} ${c.name}`.trim() }))
  );

  division1Options = signal<Division[]>([]);
  division2Options = signal<Division[]>([]);
  division1Loading = signal(false);
  division2Loading = signal(false);

  division1SelectOptions = computed<SelectOption[]>(() => this.division1Options().map(d => ({ value: d.id, label: d.name })));
  division2SelectOptions = computed<SelectOption[]>(() => this.division2Options().map(d => ({ value: d.id, label: d.name })));

  selectedDivision1Name = signal<string | null>(null);
  selectedDivision2Name = signal<string | null>(null);
  selectedCityOption    = signal<SelectOption | null>(null);
  selectedCityName      = signal<string | null>(null);

  private cityNameCache = new Map<number, string>();

  citySearchFn = (query: string): Observable<SelectOption[]> => {
    const countryId = this.businessForm.get('countryId')?.value ? Number(this.businessForm.get('countryId')?.value) : undefined;
    const divisionId = this.getLeafDivisionId() ?? undefined;
    if (!countryId) return new Observable<SelectOption[]>(sub => { sub.next([]); sub.complete(); });
    return this.geographyService.searchCities({ divisionId, countryId: divisionId ? undefined : countryId, search: query, page: 1, limit: 20 }).pipe(
      map(res => {
        res.data.forEach(c => this.cityNameCache.set(c.id, c.name));
        return res.data.map(c => ({ value: c.id, label: c.name }));
      }),
    );
  };

  // Opening days
  readonly DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  selectedDays = signal<string[]>([]);
  toggleDay(day: string): void {
    this.selectedDays.update(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day]);
    const ctrl = this.businessForm.get('openingDays');
    ctrl?.setValue(this.selectedDays().join(','));
    ctrl?.markAsTouched();
    ctrl?.updateValueAndValidity();
  }

  // Form
  businessForm!: FormGroup;

  // Category options for the form dropdown
  categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.id, label: c.name }))
  );

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
      if (this.currentView() === 'list' && !this.geoLoading()) {
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
  }

  ngOnInit(): void {
    // Default the country filter to the signed-in user's own country —
    // other countries' businesses only show once the user explicitly
    // picks one in the filter. Set before the first fetch so it's already
    // applied (the constructor's effect() won't actually fetch until
    // geoLoading resolves, so there's no extra/duplicate request).
    this.filterCountry.set(this.getDefaultCountry());
    this.initForm();
    this.loadCategories();
    this.loadGeoCountries();
    this.loadCountries();
    this.requestGeolocation();
  }

  /** The signed-in user's own country — the default the country filter starts/resets to. */
  getDefaultCountry(): string | null {
    return this.authService.currentUser()?.country || null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.unlockPageScroll();
  }

  /** Locks background scroll while the image lightbox is open. */
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

  private initForm(): void {
    this.businessForm = this.fb.group({
      name:         ['', [Validators.required, Validators.minLength(2)]],
      description:  ['', Validators.required],
      categoryId:   ['', Validators.required],
      countryId:    [null, Validators.required],
      // Division depth/labels and postal requirement are country-specific —
      // set dynamically by applyDivisionValidators()/applyPincodeValidators()
      // once a country is selected (see admin business.component.ts).
      division1Id:  [null],
      division2Id:  [null],
      cityId:       [null, Validators.required],
      address:      ['', Validators.required],
      pincode:      ['', [postalCodeValidator(null)]],
      phone:        ['', [Validators.required, Validators.pattern(/^\+?\d{7,15}$/)]],
      openingDays:  ['', Validators.required],
      openingHours: ['', Validators.required],
      email:        ['', Validators.email],
      website:      ['', urlValidator],
      whatsapp:     ['', Validators.pattern(/^\+?\d{7,15}$/)],
      mapsLink:     ['', urlValidator],
      country:      [''],
      latitude:     [''],
      longitude:    [''],
      // Settable by the owner — reset()'s default (below) is this literal
      // `true`, matching the DB column's own default.
      isActive:     [true],
    });
  }

  loadGeoCountries(): void {
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.geoCountries.set(data),
      error: () => this.toast.error('Failed to load countries'),
    });
  }

  private getLeafDivisionId(): number | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) { const v = this.businessForm.get('division2Id')?.value; return v ? Number(v) : null; }
    if (levels === 1) { const v = this.businessForm.get('division1Id')?.value; return v ? Number(v) : null; }
    return null;
  }

  private getLeafDivisionName(): string | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) return this.selectedDivision2Name();
    if (levels === 1) return this.selectedDivision1Name();
    return null;
  }

  private applyDivisionValidators(): void {
    const levels = this.adminLevels().length;
    const d1 = this.businessForm.get('division1Id');
    const d2 = this.businessForm.get('division2Id');
    d1?.setValidators(levels >= 1 ? [Validators.required] : []);
    d2?.setValidators(levels >= 2 ? [Validators.required] : []);
    d1?.updateValueAndValidity({ emitEvent: false });
    d2?.updateValueAndValidity({ emitEvent: false });
  }

  private applyPincodeValidators(): void {
    const postal = this.countryConfig()?.postalCode;
    const validators: ValidatorFn[] = [postalCodeValidator(postal?.regex ?? null)];
    if (postal?.required) validators.push(Validators.required);
    const ctrl = this.businessForm.get('pincode');
    ctrl?.setValidators(validators);
    ctrl?.updateValueAndValidity({ emitEvent: false });
  }

  private resetDivisionState(): void {
    this.countryConfig.set(null);
    this.division1Options.set([]);
    this.division2Options.set([]);
    this.selectedDivision1Name.set(null);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);
    // emitViewToModelChange:false too — see admin business.component.ts's
    // resetDivisionState() for why a plain setValue() alone isn't enough.
    const silent = { emitEvent: false, emitViewToModelChange: false };
    this.businessForm.get('division1Id')?.setValue(null, silent);
    this.businessForm.get('division2Id')?.setValue(null, silent);
    this.businessForm.get('cityId')?.setValue(null, silent);
  }

  onCountryChange(countryId: any): void {
    this.resetDivisionState();
    const id = countryId ? Number(countryId) : null;
    if (!id) { this.applyDivisionValidators(); this.applyPincodeValidators(); return; }

    this.geographyService.getCountryConfig(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        this.applyDivisionValidators();
        this.applyPincodeValidators();
        if (config.divisionLevels.length > 0) {
          this.division1Loading.set(true);
          this.geographyService.getDivisions(id).pipe(takeUntil(this.destroy$)).subscribe({
            next: divisions => { this.division1Options.set(divisions); this.division1Loading.set(false); },
            error: () => this.division1Loading.set(false),
          });
        }
      },
      error: () => this.toast.error('Failed to load country address details'),
    });
  }

  onDivision1Change(divisionId: any): void {
    this.businessForm.get('division2Id')?.setValue(null);
    this.businessForm.get('cityId')?.setValue(null);
    this.division2Options.set([]);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);

    const id = divisionId ? Number(divisionId) : null;
    this.selectedDivision1Name.set(id ? (this.division1Options().find(d => d.id === id)?.name ?? null) : null);

    const countryId = this.businessForm.get('countryId')?.value ? Number(this.businessForm.get('countryId')?.value) : null;
    if (id && countryId && this.adminLevels().length >= 2) {
      this.division2Loading.set(true);
      this.geographyService.getDivisions(countryId, id).pipe(takeUntil(this.destroy$)).subscribe({
        next: divisions => { this.division2Options.set(divisions); this.division2Loading.set(false); },
        error: () => this.division2Loading.set(false),
      });
    }
  }

  onDivision2Change(divisionId: any): void {
    this.businessForm.get('cityId')?.setValue(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);
    const id = divisionId ? Number(divisionId) : null;
    this.selectedDivision2Name.set(id ? (this.division2Options().find(d => d.id === id)?.name ?? null) : null);
  }

  onCityChange(cityId: any): void {
    const id = cityId ? Number(cityId) : null;
    const name = id ? (this.cityNameCache.get(id) ?? null) : null;
    this.selectedCityName.set(name);
    this.selectedCityOption.set(id ? { value: id, label: name ?? '' } : null);
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

  onBusinessImagesChange(files: File[]): void {
    this.selectedImages.set(files);
  }

  loadCategories(): void {
    this.loading.set(true);
    this.svc.getCategories().subscribe({
      next: data => { this.categories.set(data); this.loading.set(false); },
      error: () => { this.toast.error('Failed to load categories'); this.loading.set(false); },
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
        this.toast.error('Failed to load businesses');
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
  switchView(view: 'list' | 'categories'): void {
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

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
  }

  onFilterOpeningHoursChange(value: string | null): void {
    this.filterOpeningHours.set(value);
    this.currentPage.set(1);
  }

  onFilterDateFromChange(e: Event): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  onFilterDateToChange(e: Event): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set((e.target as HTMLInputElement).value);
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
    this.lockPageScroll();
  }

  closeImagePreview(): void {
    this.lightboxOpen.set(false);
    this.lightboxImages.set([]);
    this.activeImageIndex.set(0);
    this.unlockPageScroll();
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

  // ── Add Business Modal Logic ───────────────────────────────────
  openAddBusiness(): void {
    this.editingBusiness.set(null);
    this.businessForm.reset();
    this.selectedImages.set([]); this.selectedLogo.set(null); this.logoPreview.set(null);
    this.selectedDays.set([]);
    this.businessForm.get('openingDays')?.setValue('');
    this.resetDivisionState();
    this.applyDivisionValidators();
    this.applyPincodeValidators();
    this.fileUploadReset.update(v => v + 1); this.logoUploadReset.update(v => v + 1);

    const cat = this.selectedCategory();
    if (cat) {
      this.businessForm.get('categoryId')?.setValue(cat.id);
    }

    this.showAddBusinessModal.set(true);
  }

  closeAddBusiness(): void {
    this.showAddBusinessModal.set(false);
    this.editingBusiness.set(null);
  }

  submitBusiness(): void {
    if (this.businessForm.invalid) { this.businessForm.markAllAsTouched(); return; }
    this.submitting.set(true);
    const raw: Record<string, any> = { ...this.businessForm.value };

    // Resolve country/state/city NAME strings for the backward-compat
    // display columns, alongside the id-based countryId/cityId already in
    // `raw` from the form (mirrors the admin Business form).
    const foundCountry = this.geoCountries().find(c => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = foundCountry.name;

    const leafDivisionId = this.getLeafDivisionId();
    const leafDivisionName = this.getLeafDivisionName();
    raw['stateId'] = leafDivisionId ?? undefined;
    if (leafDivisionName) raw['state'] = leafDivisionName;

    if (this.selectedCityName()) raw['city'] = this.selectedCityName();
    delete raw['division1Id'];
    delete raw['division2Id'];

    raw['openingDays'] = this.selectedDays().join(',');

    ['email', 'website', 'mapsLink', 'whatsapp', 'latitude', 'longitude', 'logo'].forEach(key => {
      if (raw[key] === '' || raw[key] === null || raw[key] === undefined) {
        delete raw[key];
      }
    });

    const images = this.selectedImages();
    const logo = this.selectedLogo();
    const req = this.svc.createBusiness(
      raw, 
      images.length > 0 ? images : undefined,
      logo ?? undefined
    );

    req.subscribe({
      next: (biz) => {
        this.businesses.update(list => [biz, ...list]);
        this.totalItems.update(v => v + 1);
        this.toast.success('Business created successfully');
        this.closeAddBusiness();
        this.submitting.set(false);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to create business');
        this.submitting.set(false);
      },
    });
  }
}