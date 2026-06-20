import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService, MasterState, MasterCity } from '../../../core/services/master-data.service';
import { Business, BusinessCategory, PaginatedResponse, Country } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';

function urlValidator(c: AbstractControl): ValidationErrors | null {
  const v = c.value;
  if (!v) return null;
  try { const u = new URL(v); return (u.protocol === 'http:' || u.protocol === 'https:') ? null : { invalidUrl: true }; }
  catch { return { invalidUrl: true }; }
}

type ViewState = 'categories' | 'list' | 'detail';

@Component({
  selector: 'app-admin-business',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SearchableSelectComponent, FileUploadComponent],
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

  // View state
  currentView = signal<ViewState>('categories');

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

  // Business edit/delete modals
  editingBusiness       = signal<Business | null>(null);
  showDeleteBusinessConfirm = signal(false);
  businessToDelete      = signal<Business | null>(null);

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
  filterOpeningHours = signal<string | null>(null);

  hasActiveFilters = computed(() =>
    !!(this.filterSearch() || this.filterCountry() || this.filterOpeningHours())
  );

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

  // ── Category view controls ───────────────────────────────────
  catSearch   = signal('');
  catSortBy   = signal<'name'|'count'|'newest'>('name');
  catViewMode = signal<'grid'|'list'>('grid');

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
    this.initForms();
    this.loadCountries();
    this.loadCategories();
    this.loadMasterCountries();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

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
      name:         ['', [Validators.required, Validators.minLength(2)]],
      description:  ['', Validators.required],
      categoryId:   ['', Validators.required],
      countryId:    [null, Validators.required],
      stateId:      [null],
      city:         [''],
      address:      ['', Validators.required],
      pincode:      ['', [Validators.required, Validators.pattern(/^\S{3,12}$/)]],
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
    });

    this.categoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      icon: ['bi-shop', Validators.required],
      description: [''],
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

  loadBusinesses(category: BusinessCategory, resetPage = false): void {
    this.selectedCategory.set(category);
    this.currentView.set('list');
    if (resetPage) this.currentPage.set(1);
    this.loading.set(true);

    const params: Record<string, any> = {
      categoryId: category.id,
      page: this.currentPage(),
    };
    if (this.filterSearch()) params['search'] = this.filterSearch();
    if (this.filterCountry()) params['country'] = this.filterCountry();
    if (this.filterOpeningHours()) params['openingHours'] = this.filterOpeningHours();

    this.businessService.getBusinesses(params).subscribe({
      next: (response: PaginatedResponse<Business>) => {
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
  }

  applyFilters(): void {
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat, true);
  }

  clearFilters(): void {
    this.filterSearch.set('');
    this.filterCountry.set(null);
    this.filterOpeningHours.set(null);
    const cat = this.selectedCategory();
    if (cat) this.loadBusinesses(cat, true);
  }

  // Navigation
  goToCategories(): void {
    this.currentView.set('categories');
    this.selectedCategory.set(null);
    this.businesses.set([]);
    this.currentPage.set(1);
    this.filterSearch.set('');
    this.filterCountry.set(null);
    this.filterOpeningHours.set(null);
  }

  goToList(): void {
    this.currentView.set('list');
    this.selectedBusiness.set(null);
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
    this.selectedImages.set([]); this.selectedLogo.set(null); this.logoPreview.set(null);
    this.selectedDays.set([]);
    this.businessForm.get('openingDays')?.setValue('');
    this.bizStates.set([]); this.bizCities.set([]);
    this.fileUploadReset.update(v => v + 1); this.logoUploadReset.update(v => v + 1);
    this.showAddBusinessModal.set(true);
  }

  openEditBusiness(event: Event, biz: Business): void {
    event.stopPropagation();
    this.editingBusiness.set(biz);

    // Restore opening days
    const days = biz.openingDays ?? (biz as any).opening_days ?? '';
    const parsedDays = days ? days.split(',').map((d: string) => d.trim()).filter(Boolean) : [];
    this.selectedDays.set(parsedDays);

    // Patch all non-cascade fields immediately
    this.businessForm.patchValue({
      name:         biz.name         ?? '',
      description:  biz.description  ?? '',
      categoryId:   biz.categoryId   ?? (biz as any).category_id ?? biz.category?.id ?? '',
      stateId:      null,
      city:         biz.city         ?? '',
      address:      biz.address      ?? '',
      pincode:      biz.pincode      ?? '',
      phone:        biz.phone        ?? '',
      email:        biz.email        ?? '',
      website:      biz.website      ?? '',
      whatsapp:     biz.whatsapp     ?? '',
      mapsLink:     biz.mapsLink     ?? (biz as any).maps_link ?? '',
      openingHours: biz.openingHours ?? (biz as any).opening_hours ?? '',
      openingDays:  parsedDays.join(','),
      country:      biz.country      ?? '',
      latitude:     biz.latitude     ?? '',
      longitude:    biz.longitude    ?? '',
    });

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

    this.showAddBusinessModal.set(true);
  }

  closeAddBusiness(): void {
    this.showAddBusinessModal.set(false);
    this.editingBusiness.set(null);
  }

  onBusinessImagesChange(files: File[]): void {
    this.selectedImages.set(files);
  }

  submitBusiness(): void {
    if (this.businessForm.invalid) { this.businessForm.markAllAsTouched(); return; }
    this.submitting.set(true);
    const raw: Record<string, any> = { ...this.businessForm.value };

    // Resolve country name from selected countryId
    const foundCountry = this.bizCountries().find((c: any) => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = (foundCountry as any).name;

    // Resolve state name from selected stateId
    const foundState = this.bizStates().find(s => String(s.id) === String(raw['stateId']));
    if (foundState) raw['state'] = foundState.name;

    // Opening days from signal (authoritative source)
    raw['openingDays'] = this.selectedDays().join(',');

    delete raw['countryId'];
    delete raw['stateId'];

    const images  = this.selectedImages();
    const editing = this.editingBusiness();
    const req = editing
      ? this.businessService.updateBusiness(editing.id, raw, images.length > 0 ? images : undefined)
      : this.businessService.createBusiness(raw, images.length > 0 ? images : undefined);

    req.subscribe({
      next: (biz) => {
        if (editing) {
          this.businesses.update(list => list.map(b => b.id === biz.id ? biz : b));
          if (this.selectedBusiness()?.id === biz.id) this.selectedBusiness.set(biz);
          this.toast.success('Business updated successfully');
        } else {
          this.businesses.update(list => [biz, ...list]);
          this.toast.success('Business created successfully');
        }
        this.closeAddBusiness();
        this.submitting.set(false);
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
        this.businesses.update(list => list.filter(b => b.id !== biz.id));
        this.toast.success('Business deleted');
        this.closeDeleteBusiness();
        this.deletingId.set(null);
        if (this.currentView() === 'detail') this.goToList();
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
}
