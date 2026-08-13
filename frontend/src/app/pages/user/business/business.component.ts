import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, FileUploadComponent, ImageUrlPipe],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
})
export class UserBusinessComponent implements OnInit {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private geographyService  = inject(GeographyService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  // ── View state ──────────────────────────────────────────────
  currentView      = signal<ViewState>('list');
  /** 'list' = Business List view, 'categories' = Category browse view */
  businessView     = signal<'list' | 'categories'>('list');

  // ── Master data ─────────────────────────────────────────────
  categories       = signal<BusinessCategory[]>([]);
  businesses       = signal<Business[]>([]);
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);
  loading          = signal(true);
  currentPage      = signal(1);
  totalPages       = signal(1);
  totalItems       = signal(0);
  activeImageIndex = signal(0);

  // ── Geolocation ─────────────────────────────────────────────
  userLatitude     = signal<number | null>(null);
  userLongitude    = signal<number | null>(null);
  geoDenied        = signal(false);
  geoLoading       = signal(true);

  // ── Filters ─────────────────────────────────────────────────
  filterSearch        = signal('');
  filterCountry       = signal<string | null>(null);
  filterCountryOptions: SelectOption[] = [];
  /** Distance in meters: null = no filter, 500 = Nearby, 1000 = 1KM, 5000 = 5KM */
  filterDistance      = signal<number | null>(500);
  /** Selected category ID for filter dropdown (null/empty = all) */
  filterCategoryId    = signal<string | null>(null);

  /** Category options for filter dropdown (includes "All Categories") */
  categorySelectOptions = computed<SelectOption[]>(() => {
    const cats = this.categories().map(c => ({ value: c.id, label: c.name }));
    return [{ value: '', label: 'All Categories' }, ...cats];
  });

  hasActiveFilters = computed(() => !!(this.filterSearch() || this.filterCountry() || this.filterDistance() || this.filterCategoryId()));
  totalBusinesses  = computed(() => this.categories().reduce((s,c) => s + (c._count?.businesses ?? 0), 0));
  totalCategoriesCount = computed(() => this.categories().length);

  // ── Category view (legacy) controls ─────────────────────────
  catSearch   = signal('');
  catSortBy   = signal<'name'|'count'|'newest'>('name');
  catViewMode = signal<'grid'|'list'>('grid');
  bizViewMode = signal<'grid'|'list'>('grid');

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
      const _dist = this.filterDistance();
      const _catId = this.filterCategoryId();
      const _page = this.currentPage();
      if (this.currentView() === 'list' && !this.geoLoading()) {
        this.loadNearbyBusinesses();
      }
    });
  }

  ngOnInit(): void {
    this.initForm();
    this.loadCategories();
    this.loadGeoCountries();
    this.loadCountries();
    this.requestGeolocation();
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

        // Simple client-side pagination
        const limit = 20;
        const page = this.currentPage();
        const start = (page - 1) * limit;
        const paged = filtered.slice(start, start + limit);
        const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

        this.businesses.set(paged);
        this.totalItems.set(filtered.length);
        this.totalPages.set(totalPages);
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

  /** Set distance filter */
  setDistance(distance: number | null): void {
    this.filterDistance.set(distance);
    this.currentPage.set(1);
  }

  /** Switch view between Business List and Category View */
  switchView(view: 'list' | 'categories'): void {
    this.businessView.set(view);
    this.currentView.set(view === 'categories' ? 'categories' : 'list');
    if (view === 'list') {
      this.currentPage.set(1);
      this.loadNearbyBusinesses();
    }
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadNearbyBusinesses();
  }

  clearFilters(): void {
    this.filterSearch.set('');
    this.filterCountry.set(null);
    this.filterDistance.set(500);
    this.filterCategoryId.set(null);
    this.currentPage.set(1);
  }

  loadBusinessDetail(biz: Business): void {
    this.selectedBusiness.set(biz); this.activeImageIndex.set(0); this.currentView.set('detail');
  }

  goToCategories(): void {
    this.currentView.set('categories');
    this.businessView.set('categories');
    this.selectedCategory.set(null);
    this.businesses.set([]);
    this.currentPage.set(1);
    this.filterCategoryId.set(null);
    this.filterSearch.set('');
    this.filterCountry.set(null);
    this.filterDistance.set(500);
  }

  goToList(): void {
    this.currentView.set('list');
    this.businessView.set('list');
    this.selectedBusiness.set(null);
  }

  setActiveImage(i: number): void {
    this.activeImageIndex.set(i);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
  }

  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let start = Math.max(1, cur - Math.floor(max/2));
    const end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  getDirectionsUrl(): string {
    const biz = this.selectedBusiness(); if (!biz) return '#';
    if (biz.latitude && biz.longitude) return `https://www.google.com/maps/dir/?api=1&destination=${biz.latitude},${biz.longitude}`;
    if (biz.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address)}`;
    return '#';
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