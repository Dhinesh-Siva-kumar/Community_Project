import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService } from '../../../core/services/master-data.service';
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
  selector: 'app-user-business',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, FileUploadComponent],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
})
export class UserBusinessComponent implements OnInit {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private masterDataService = inject(MasterDataService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  currentView      = signal<ViewState>('categories');
  categories       = signal<BusinessCategory[]>([]);
  businesses       = signal<Business[]>([]);
  selectedCategory = signal<BusinessCategory | null>(null);
  selectedBusiness = signal<Business | null>(null);
  loading          = signal(true);
  currentPage      = signal(1);
  totalPages       = signal(1);
  totalItems       = signal(0);
  activeImageIndex = signal(0);

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

  filterSearch        = signal('');
  filterCountry       = signal<string | null>(null);
  filterCountryOptions: SelectOption[] = [];
  hasActiveFilters    = computed(() => !!(this.filterSearch() || this.filterCountry()));
  totalBusinesses     = computed(() => this.categories().reduce((s,c) => s + (c._count?.businesses ?? 0), 0));
  totalCategoriesCount= computed(() => this.categories().length);

  // ── Add Business Modal ────────────────────────────────────────
  showAddBusinessModal = signal(false);
  editingBusiness      = signal<Business | null>(null);
  submitting           = signal(false);

  // Image / Logo
  selectedImages   = signal<File[]>([]);
  fileUploadReset  = signal(0);
  selectedLogo     = signal<File | null>(null);
  logoPreview      = signal<string | null>(null);
  logoUploadReset  = signal(0);

  // Address cascade for business form (country only — state & city are manual inputs)
  bizCountries     = signal<Country[]>([]);

  bizCountryOptions = computed<SelectOption[]>(() =>
    this.bizCountries().map(c => ({ value: String((c as any).id), label: `${(c as any).flag_emoji ?? ''} ${c.name}`.trim() }))
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

  ngOnInit(): void {
    this.initForm();
    this.loadCategories();
    this.loadMasterCountries();
    this.loadCountries();
  }

  private initForm(): void {
    this.businessForm = this.fb.group({
      name:         ['', [Validators.required, Validators.minLength(2)]],
      description:  ['', Validators.required],
      categoryId:   ['', Validators.required],
      countryId:    [null, Validators.required],
      state:        [''],
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
  }

  loadMasterCountries(): void {
    this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.bizCountries.set(data),
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

  loadBusinesses(category: BusinessCategory, resetPage = false): void {
    this.selectedCategory.set(category);
    this.currentView.set('list');
    if (resetPage) this.currentPage.set(1);
    this.loading.set(true);
    const params: Record<string, any> = { categoryId: category.id, page: this.currentPage() };
    if (this.filterSearch()) params['search'] = this.filterSearch();
    if (this.filterCountry()) params['country'] = this.filterCountry();
    this.svc.getBusinesses(params).subscribe({
      next: (res: PaginatedResponse<Business>) => {
        this.businesses.set(res.data);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load businesses'); this.loading.set(false); },
    });
  }

  applyFilters(): void { const cat = this.selectedCategory(); if (cat) this.loadBusinesses(cat, true); }
  clearFilters(): void { this.filterSearch.set(''); this.filterCountry.set(null); this.applyFilters(); }

  loadBusinessDetail(biz: Business): void {
    this.selectedBusiness.set(biz); this.activeImageIndex.set(0); this.currentView.set('detail');
  }

  goToCategories(): void {
    this.currentView.set('categories'); this.selectedCategory.set(null);
    this.businesses.set([]); this.currentPage.set(1);
    this.filterSearch.set(''); this.filterCountry.set(null);
  }

  goToList(): void { this.currentView.set('list'); this.selectedBusiness.set(null); }
  setActiveImage(i: number): void { this.activeImageIndex.set(i); }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    const cat = this.selectedCategory(); if (cat) this.loadBusinesses(cat);
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
    this.fileUploadReset.update(v => v + 1); this.logoUploadReset.update(v => v + 1);

    // Pre-select the current category if we're in list view
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

    // Resolve country name from selected countryId
    const foundCountry = this.bizCountries().find((c: any) => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = (foundCountry as any).name;

    // Opening days from signal (authoritative source)
    raw['openingDays'] = this.selectedDays().join(',');

    delete raw['countryId'];

    // Strip empty optional fields that would fail backend Zod validation
    // e.g., email: z.string().email().optional() rejects '' (empty string)
    ['email', 'website', 'mapsLink', 'whatsapp', 'latitude', 'longitude', 'logo'].forEach(key => {
      if (raw[key] === '' || raw[key] === null || raw[key] === undefined) {
        delete raw[key];
      }
    });

    const images = this.selectedImages();
    const req = this.svc.createBusiness(raw, images.length > 0 ? images : undefined);

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