import { Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subject, takeUntil, combineLatest, Observable, map } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { Business, BusinessCategory, Country, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { getPhoneRule } from '../../utils/phone';

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

/**
 * The single Add/Edit Business form modal — a straight port of the admin
 * Business page's modal (same fields, same phone/WhatsApp dial-code
 * handling, same opening-hours time pickers, same UI chrome) so the user
 * side gets identical design and functionality. Shared by the user
 * Business directory page and the profile "My Businesses" tab so this
 * form only exists in one place. Create vs edit is decided by whether
 * `editBusinessId` is set when `open` becomes true.
 */
@Component({
  selector: 'app-business-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, FileUploadComponent, ImageUrlPipe],
  templateUrl: './business-form-modal.component.html',
  styleUrls: ['./business-form-modal.component.scss'],
})
export class BusinessFormModalComponent implements OnChanges, OnDestroy {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private geographyService  = inject(GeographyService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  private previousBodyOverflow: string | null = null;
  private previousHtmlOverflow: string | null = null;

  @Input() open = false;
  @Input() editBusinessId: string | null = null;
  /** Pre-selected category for the "Add" entry point reached from within a category browse view. */
  @Input() defaultCategoryId: string | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful create/update; the host is responsible for updating its own list state. */
  @Output() saved = new EventEmitter<Business>();

  submitting              = signal(false);
  businessSubmitAttempted = signal(false);
  editingBusiness         = signal<Business | null>(null);

  categories = signal<BusinessCategory[]>([]);
  private categoriesLoaded = false;

  categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map(c => ({ value: c.id, label: c.name }))
  );

  // Image / Logo
  selectedImages         = signal<File[]>([]);
  fileUploadReset        = signal(0);
  selectedLogo            = signal<File | null>(null);
  logoPreview            = signal<string | null>(null);
  logoUploadReset        = signal(0);
  existingGalleryImages = signal<string[]>([]);

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

  // ── Phone country for Contact section (dial-code dropdown) ──
  phoneCountries = signal<Country[]>([]);
  private phoneCountriesLoaded = false;
  phoneCountryOptions = computed<SelectOption[]>(() =>
    this.phoneCountries().map(c => ({
      value: c.id,
      label: `${c.flag_emoji || ''} ${c.dial_code}`.trim(),
    }))
  );

  // ── "Same as phone" checkbox for WhatsApp ──
  sameAsPhone = signal(false);

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

  // Opening hours time pickers
  openingHoursTouched = signal(false);
  timeDropdownOpen = signal<'from' | 'to' | null>(null);

  /** Generate time options in 30-min intervals: 00:00, 00:30, 01:00 ... 23:30 */
  readonly TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2, '0')}:${m}`;
  });

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
    const dashMatch = hours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (dashMatch) {
      const from = this.parseTo24h(dashMatch[1].trim());
      const to   = this.parseTo24h(dashMatch[2].trim());
      if (from) this.businessForm.get('openingHoursFrom')?.setValue(from);
      if (to)   this.businessForm.get('openingHoursTo')?.setValue(to);
      return;
    }
    const hyphenMatch = hours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (hyphenMatch) {
      const from = this.parseTo24h(hyphenMatch[1].trim());
      const to   = this.parseTo24h(hyphenMatch[2].trim());
      if (from) this.businessForm.get('openingHoursFrom')?.setValue(from);
      if (to)   this.businessForm.get('openingHoursTo')?.setValue(to);
    }
  }

  // Auto-generated maps link tracking
  mapsLinkAutoGenerated = signal(false);
  mapsLinkUserEdited = signal(false);

  businessForm!: FormGroup;

  constructor() {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.loadCategoriesIfNeeded();
        this.loadGeoCountriesIfNeeded();
        this.loadPhoneCountriesIfNeeded();
        if (this.editBusinessId) {
          this.loadForEdit(this.editBusinessId);
        } else {
          this.resetForCreate();
        }
        this.lockPageScroll();
      } else {
        this.unlockPageScroll();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.unlockPageScroll();
  }

  private lockPageScroll(): void {
    const body = document.body;
    const html = document.documentElement;
    if (this.previousBodyOverflow === null) this.previousBodyOverflow = body.style.overflow;
    if (this.previousHtmlOverflow === null) this.previousHtmlOverflow = html.style.overflow;
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

  private initForm(): void {
    this.businessForm = this.fb.group({
      name:         ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      description:  ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
      categoryId:   ['', Validators.required],
      countryId:    [null, Validators.required],
      // Division depth (0/1/2 levels) and postal requirement are country-
      // specific — division1Id/division2Id/pincode's validators are set
      // dynamically by applyDivisionValidators()/applyPincodeValidators()
      // once a country (and its config) is selected.
      division1Id:  [null],
      division2Id:  [null],
      cityId:       [null, Validators.required],
      address:      ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
      pincode:      ['', [postalCodeValidator(null)]],
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
      // Settable by the owner or an admin — reset()'s default (below) is
      // this literal `true`, matching the DB column's own default.
      isActive:     [true],
    });

    this.setupOpeningHoursSync();
    this.setupMapsLinkAutoGeneration();

    // Re-run phone validation whenever the phone country changes — also
    // revalidates WhatsApp, since it uses the phone country when "same as
    // phone" is checked.
    this.businessForm.get('phoneCountryId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.businessForm.get('phone')?.updateValueAndValidity();
        this.businessForm.get('whatsapp')?.updateValueAndValidity();
      });

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
          waCtrl?.setValue(phoneCtrl?.value ?? '');
          waCtrl?.disable();
        } else {
          waCtrl?.enable();
          waCtrl?.updateValueAndValidity();
        }
      });

    this.businessForm.get('phone')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        if (this.sameAsPhone()) {
          this.businessForm.get('whatsapp')?.setValue(val ?? '');
        }
      });
  }

  private setupOpeningHoursSync(): void {
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
    this.businessForm.get('mapsLink')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val: string) => {
        this.mapsLinkUserEdited.set(!!(val ?? '').trim());
        this.mapsLinkAutoGenerated.set(false);
      });

    const locationControls = [
      this.businessForm.get('address')!,
      this.businessForm.get('cityId')!,
      this.businessForm.get('division1Id')!,
      this.businessForm.get('division2Id')!,
      this.businessForm.get('countryId')!,
      this.businessForm.get('pincode')!,
    ];

    combineLatest(locationControls.map(c => c.valueChanges))
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.mapsLinkUserEdited()) return;

        const address  = this.businessForm.get('address')?.value ?? '';
        const pincode  = this.businessForm.get('pincode')?.value ?? '';
        const cityName = this.selectedCityName() ?? '';
        const stateName = this.getLeafDivisionName() ?? '';

        const countryId = this.businessForm.get('countryId')?.value;
        let countryName = '';
        if (countryId) {
          const found = this.geoCountries().find(c => String(c.id) === String(countryId));
          if (found) countryName = found.name;
        }

        const parts = [address, cityName, stateName, countryName, pincode].filter((v: string) => !!v.trim());
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

  private loadCategoriesIfNeeded(): void {
    if (this.categoriesLoaded) return;
    this.categoriesLoaded = true;
    this.svc.getCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.categories.set(data),
      error: () => this.toast.error('Failed to load categories'),
    });
  }

  private loadGeoCountriesIfNeeded(): void {
    if (this.geoCountries().length) return;
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.geoCountries.set(data),
      error: () => this.toast.error('Failed to load countries'),
    });
  }

  private loadPhoneCountriesIfNeeded(): void {
    if (this.phoneCountriesLoaded) return;
    this.phoneCountriesLoaded = true;
    this.authService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const data: Country[] = res.data ?? res ?? [];
        this.phoneCountries.set(data);
        this.applyDefaultPhoneCountry();
      },
      error: () => {},
    });
  }

  /** Defaults Phone/WhatsApp country to India (+91) when not already set — mirrors admin's loadPhoneCountries(). */
  private applyDefaultPhoneCountry(): void {
    const india = this.phoneCountries().find((c) => c.name === 'India');
    if (!india) return;
    const patch: Record<string, unknown> = {};
    if (!this.businessForm.get('phoneCountryId')?.value) patch['phoneCountryId'] = india.id;
    if (!this.businessForm.get('whatsappCountryId')?.value) patch['whatsappCountryId'] = india.id;
    if (Object.keys(patch).length) {
      this.businessForm.patchValue(patch);
      this.businessForm.get('phone')?.updateValueAndValidity();
      this.businessForm.get('whatsapp')?.updateValueAndValidity();
    }
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
    const countries = [...this.phoneCountries()].sort((a, b) => b.dial_code.length - a.dial_code.length);
    for (const c of countries) {
      const dial = c.dial_code.replace(/\D/g, '');
      if (dial && withoutPlus.startsWith(dial)) {
        return { countryId: c.id, digits: withoutPlus.slice(dial.length) };
      }
    }
    return { countryId: null, digits: withoutPlus };
  }

  // ── Phone validator (country-aware) ─────────────────────────
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
      const rule = getPhoneRule(country.dial_code);
      const valid = digits.length >= rule.minLen && digits.length <= rule.maxLen && (rule.pattern ? rule.pattern.test(digits) : true);
      return valid ? null : { phoneInvalid: rule.hint };
    };
  }

  // ── WhatsApp validator (country-aware) — uses the Phone country when
  // "same as phone" is checked, otherwise the dedicated WhatsApp country. ──
  whatsappValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const digits = (control.value ?? '').replace(/\D/g, '');
      if (!digits) return null;
      const parent = control.parent;
      if (!parent || !this.phoneCountries().length) return null;
      const countryId = this.sameAsPhone() ? parent.get('phoneCountryId')?.value : parent.get('whatsappCountryId')?.value;
      if (!countryId) return null;
      const country = this.phoneCountries().find(c => c.id == countryId);
      if (!country) return null;
      const rule = getPhoneRule(country.dial_code);
      const valid = digits.length >= rule.minLen && digits.length <= rule.maxLen && (rule.pattern ? rule.pattern.test(digits) : true);
      return valid ? null : { phoneInvalid: rule.hint };
    };
  }

  private resetForCreate(): void {
    this.editingBusiness.set(null);
    this.businessForm.reset();
    this.businessSubmitAttempted.set(false);
    // reset() clears phoneCountryId/whatsappCountryId — re-apply the India
    // default (applyDefaultPhoneCountry() only auto-fills them once, on first load).
    this.applyDefaultPhoneCountry();
    this.selectedImages.set([]); this.selectedLogo.set(null); this.logoPreview.set(null);
    this.existingGalleryImages.set([]);
    this.selectedDays.set([]);
    this.businessForm.get('openingDays')?.setValue('');
    this.resetDivisionState();
    this.applyDivisionValidators();
    this.applyPincodeValidators();
    this.fileUploadReset.update(v => v + 1); this.logoUploadReset.update(v => v + 1);
    this.openingHoursTouched.set(false);
    if (this.defaultCategoryId) this.businessForm.get('categoryId')?.setValue(this.defaultCategoryId);
  }

  private loadForEdit(id: string): void {
    this.svc.getBusiness(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (biz) => this.applyEditFormData(biz),
      error: () => { this.toast.error('Failed to load business details'); this.closed.emit(); },
    });
  }

  private applyEditFormData(biz: Business): void {
    this.editingBusiness.set(biz);
    this.businessSubmitAttempted.set(false);

    const days = biz.openingDays ?? (biz as any).opening_days ?? '';
    const parsedDays = days ? days.split(',').map((d: string) => d.trim()).filter(Boolean) : [];
    this.selectedDays.set(parsedDays);

    this.businessForm.patchValue({
      name:         biz.name         ?? '',
      description:  biz.description  ?? '',
      categoryId:   biz.categoryId   ?? (biz as any).category_id ?? biz.category?.id ?? '',
      address:      biz.address      ?? '',
      pincode:      biz.pincode      ?? '',
      email:        biz.email        ?? '',
      website:      biz.website      ?? '',
      mapsLink:     biz.mapsLink     ?? (biz as any).maps_link ?? '',
      openingDays:  parsedDays.join(','),
      country:      biz.country      ?? '',
      latitude:     biz.latitude     ?? '',
      longitude:    biz.longitude    ?? '',
      isActive:     biz.isActive     ?? true,
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
        next: (res: any) => { this.phoneCountries.set(res.data ?? res ?? []); applyPhoneFields(); },
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
    this.existingGalleryImages.set(biz.images ? [...biz.images] : []);
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);

    // Country-aware address hierarchy — resurrected directly from the
    // stored ids (countryId/stateId/cityId + stateChain, all returned by
    // getBusiness()) rather than fragile case-insensitive name matching.
    // Every setValue() below is silent ({emitEvent:false,
    // emitViewToModelChange:false}) — a non-silent setValue() on
    // division1Id would re-fire onDivision1Change(), which (correctly, for
    // real user input) clears division2Id/cityId as a side effect, wiping
    // out the City field this same function just set moments earlier.
    const silent = { emitEvent: false, emitViewToModelChange: false };
    this.resetDivisionState();
    const countryId = biz.countryId ?? (biz as any).country_id ?? null;
    if (countryId) {
      this.businessForm.get('countryId')?.setValue(countryId, silent);
      this.geographyService.getCountryConfig(countryId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (config) => {
          this.countryConfig.set(config);
          this.applyDivisionValidators();
          this.applyPincodeValidators();
          if (config.divisionLevels.length === 0) return;

          const chain = biz.stateChain ?? [];
          this.division1Loading.set(true);
          this.geographyService.getDivisions(countryId).pipe(takeUntil(this.destroy$)).subscribe({
            next: (divisions) => {
              this.division1Options.set(divisions);
              this.division1Loading.set(false);
              const lvl1 = chain[0];
              if (!lvl1) return;
              this.businessForm.get('division1Id')?.setValue(lvl1.id, silent);
              this.selectedDivision1Name.set(lvl1.name);
              if (config.divisionLevels.length < 2) return;

              this.division2Loading.set(true);
              this.geographyService.getDivisions(countryId, lvl1.id).pipe(takeUntil(this.destroy$)).subscribe({
                next: (divisions2) => {
                  this.division2Options.set(divisions2);
                  this.division2Loading.set(false);
                  const lvl2 = chain[1];
                  if (!lvl2) return;
                  this.businessForm.get('division2Id')?.setValue(lvl2.id, silent);
                  this.selectedDivision2Name.set(lvl2.name);
                },
                error: () => this.division2Loading.set(false),
              });
            },
            error: () => this.division1Loading.set(false),
          });
        },
        error: () => {},
      });
    } else {
      this.applyDivisionValidators();
      this.applyPincodeValidators();
    }

    const cityId = biz.cityId ?? (biz as any).city_id ?? null;
    if (cityId) {
      const cityName = biz.cityName ?? (biz as any).city ?? null;
      this.businessForm.get('cityId')?.setValue(cityId, silent);
      this.selectedCityName.set(cityName);
      this.selectedCityOption.set({ value: cityId, label: cityName ?? '' });
      if (cityName) this.cityNameCache.set(cityId, cityName);
    }
  }

  removeExistingImage(img: string): void {
    this.existingGalleryImages.update(imgs => imgs.filter(i => i !== img));
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

  requestClose(): void {
    this.closed.emit();
  }

  submitBusiness(): void {
    this.businessSubmitAttempted.set(true);
    this.businessForm.markAllAsTouched();
    // logoPreview() covers both cases: a freshly-selected file, or an
    // untouched existing logo when editing. It's only empty when the user
    // never picked one (create) or explicitly cleared it (edit) without
    // choosing a replacement — either way, the logo is required.
    if (this.businessForm.invalid || !this.logoPreview()) return;

    this.submitting.set(true);
    // getRawValue() (not .value) — .value silently drops disabled controls,
    // and `whatsapp` is disabled while "same as phone" is checked, which
    // would mean the synced WhatsApp number never actually gets submitted.
    const raw: Record<string, any> = { ...this.businessForm.getRawValue() };

    // Resolve country/state/city NAME strings for the backward-compat
    // display columns, alongside the id-based countryId/cityId already in
    // `raw` from the form (mirrors the admin Business form).
    const foundCountry = this.geoCountries().find(c => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = foundCountry.name;

    const leafDivisionId = this.getLeafDivisionId();
    const leafDivisionName = this.getLeafDivisionName();
    raw['stateId'] = leafDivisionId ?? undefined;
    if (leafDivisionName) raw['state'] = leafDivisionName;
    else delete raw['state'];

    if (this.selectedCityName()) raw['city'] = this.selectedCityName();
    delete raw['division1Id'];
    delete raw['division2Id'];

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

    raw['openingDays'] = this.selectedDays().join(',');

    delete raw['phoneCountryId'];
    delete raw['whatsappCountryId'];
    delete raw['openingHoursFrom'];
    delete raw['openingHoursTo'];

    const images = this.selectedImages();
    const logo = this.selectedLogo();
    const editing = this.editingBusiness();
    // Existing gallery photos the user didn't remove — sent alongside any
    // newly uploaded files so the backend can rebuild the full gallery
    // (kept + new) instead of the new upload wiping everything out.
    if (editing) raw['existingImages'] = JSON.stringify(this.existingGalleryImages());

    const req = editing
      ? this.svc.updateBusiness(editing.id, raw, images.length > 0 ? images : undefined, logo ?? undefined)
      : this.svc.createBusiness(raw, images.length > 0 ? images : undefined, logo ?? undefined);

    req.subscribe({
      next: (biz) => {
        this.toast.success(editing ? 'Business updated successfully' : 'Business created successfully');
        this.submitting.set(false);
        this.saved.emit(biz);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? (editing ? 'Failed to update business' : 'Failed to create business'));
        this.submitting.set(false);
      },
    });
  }
}
