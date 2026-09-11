import { Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, HostListener, inject, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subject, takeUntil, combineLatest, Observable, map } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { UnsavedChangesService } from '../../../core/services/unsaved-changes.service';
import { Business, BusinessCategory, Country, GeoCountry, CountryAddressConfig, Division, OpeningHoursJson } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';
import { ToggleComponent } from '../toggle/toggle.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { OpeningHoursEditorComponent } from '../opening-hours-editor/opening-hours-editor.component';
import { RadioGroupComponent, RadioOption } from '../radio-group/radio-group.component';
import { deriveLegacyDays, parseLegacyOpeningHours } from '../../utils/opening-hours';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { getPhoneRule } from '../../utils/phone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { urlValidator } from '../../validators/url.validator';

/** Country-aware postal code validator — see admin business.component.ts for the fuller explanation. */
function postalCodeValidator(regex: string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v || !regex) return null;
    try { return new RegExp(regex).test(v) ? null : { postalFormat: true }; }
    catch { return null; }
  };
}

/** Phone, WhatsApp and Email are each individually optional — this is the
 * group-level rule that at least one of the three must be filled in. */
function atLeastOneContactValidator(group: AbstractControl): ValidationErrors | null {
  const phone = ((group.get('phone')?.value as string) ?? '').trim();
  const whatsapp = ((group.get('whatsapp')?.value as string) ?? '').trim();
  const email = ((group.get('email')?.value as string) ?? '').trim();
  return (phone || whatsapp || email) ? null : { noContactMethod: true };
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, ToggleComponent, FileUploadComponent, OpeningHoursEditorComponent, RadioGroupComponent, ImageUrlPipe, TranslatePipe, ScrollLockDirective],
  templateUrl: './business-form-modal.component.html',
  styleUrls: ['./business-form-modal.component.scss'],
})
export class BusinessFormModalComponent implements OnChanges, OnDestroy {
  private svc               = inject(BusinessService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private translate         = inject(TranslateService);
  private geographyService  = inject(GeographyService);
  private unsavedChanges    = inject(UnsavedChangesService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  @Input() open = false;
  @Input() editBusinessId: string | null = null;
  /** Pre-selected category for the "Add" entry point reached from within a category browse view. */
  @Input() defaultCategoryId: string | null = null;
  /**
   * Rendered inside the admin console. Only affects copy — the admin page
   * uses this same modal rather than keeping its own duplicate of the form.
   * Authorization stays entirely server-side.
   */
  @Input() isAdmin = false;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful create/update; the host is responsible for updating its own list state. */
  @Output() saved = new EventEmitter<Business>();

  submitting              = signal(false);
  businessSubmitAttempted = signal(false);
  editingBusiness         = signal<Business | null>(null);

  categories = signal<BusinessCategory[]>([]);
  private categoriesLoaded = false;

  // A deprioritised category (e.g. "Bar" — kept, not deleted, because a
  // business already uses it) is hidden from selection for a new business,
  // but stays selectable while editing the one business that already has
  // it — otherwise its category would appear to vanish from the dropdown.
  categoryOptions = computed<SelectOption[]>(() => {
    const editingCategoryId = this.editingBusiness()?.categoryId ?? null;
    return this.categories()
      .filter(c => c.isActive !== false || c.id === editingCategoryId)
      .map(c => ({ value: c.id, label: c.name }));
  });

  // ── Logo ──
  selectedLogo  = signal<File | null>(null);
  logoPreview   = signal<string | null>(null);
  logoUploadReset = signal(0);

  // ── The three galleries ──
  // Each carries the same trio of state: newly picked files, the existing
  // URLs the user hasn't removed, and a counter that resets its uploader.
  // GALLERIES below drives one set of markup in the template instead of
  // three near-identical copies.
  selectedImages     = signal<File[]>([]);
  selectedMenuImages = signal<File[]>([]);
  selectedCardImages = signal<File[]>([]);

  existingGalleryImages = signal<string[]>([]);
  existingMenuImages    = signal<string[]>([]);
  existingCardImages    = signal<string[]>([]);

  fileUploadReset     = signal(0);
  menuUploadReset     = signal(0);
  cardUploadReset     = signal(0);

  readonly GALLERIES = [
    {
      key: 'gallery' as const, num: '05',
      icon: 'bi-images',
      titleKey: 'components.businessForm.galleryLabel',
      dropKey: 'components.fileUpload.dragGalleryImages',
      selected: this.selectedImages, existing: this.existingGalleryImages, reset: this.fileUploadReset,
      source: (b: Business) => b.images ?? [],
    },
    {
      key: 'menu' as const, num: '06',
      icon: 'bi-card-list',
      titleKey: 'components.businessForm.menuImagesLabel',
      dropKey: 'components.fileUpload.dragMenuImages',
      selected: this.selectedMenuImages, existing: this.existingMenuImages, reset: this.menuUploadReset,
      source: (b: Business) => b.menuImages ?? [],
    },
    {
      key: 'card' as const, num: '07',
      icon: 'bi-credit-card-2-front',
      titleKey: 'components.businessForm.cardImagesLabel',
      dropKey: 'components.fileUpload.dragCardImages',
      selected: this.selectedCardImages, existing: this.existingCardImages, reset: this.cardUploadReset,
      source: (b: Business) => b.cardImages ?? [],
    },
  ];

  /**
   * Whether the business being edited started with images in this gallery.
   * Drives the "existing photos" block: without it, a gallery that was
   * always empty would render a "all photos removed" note on every edit.
   */
  galleryHadImages(gallery: { source: (b: Business) => string[] }): boolean {
    const biz = this.editingBusiness();
    return !!biz && gallery.source(biz).length > 0;
  }

  // ── Visibility ──
  readonly visibilityOptions: RadioOption[] = [
    { value: 'COUNTRY', label: 'components.businessForm.visibilityCountry', icon: 'bi-geo-alt-fill' },
    { value: 'WORLDWIDE', label: 'components.businessForm.visibilityWorldwide', icon: 'bi-globe2' },
  ];

  // ── Country-aware address hierarchy (Country → Division(s) → City → Postal) ──
  // Mirrors the admin Business form's implementation — see
  // pages/admin/business/business.component.ts for the fuller explanation.
  geoCountries  = signal<GeoCountry[]>([]);
  countryConfig = signal<CountryAddressConfig | null>(null);
  adminLevels   = computed(() => this.countryConfig()?.divisionLevels ?? []);

  geoCountryOptions = computed<SelectOption[]>(() =>
    this.geoCountries().map(c => ({ value: c.id, label: `${c.flagEmoji ?? ''} ${c.name}`.trim() }))
  );

  // ── Region label (level-1 division) — the country/state DETECTION logic
  // (which countries get a division dropdown, how many, what data
  // populates it) is untouched; this only overrides what the *first*
  // dropdown is CALLED, since the backend's own computed label is derived
  // from the raw admin-division `type` in the geo dataset (e.g. Germany's
  // literally comes back "Land") rather than a name a user would recognize.
  // Tracked as its own signal (not just read off `businessForm.get(...)`)
  // because Angular's `computed()` only reacts to signal reads, and
  // `applyEditFormData()` sets `countryId` silently (no valueChanges) so a
  // plain form-control read wouldn't update when editing a business.
  private static readonly REGION_LABEL_KEYS: Record<string, string> = {
    GB: 'components.businessForm.regionLabel.countyRegion', // United Kingdom
    IN: 'components.businessForm.regionLabel.state',        // India
    CA: 'components.businessForm.regionLabel.province',     // Canada
    DE: 'components.businessForm.regionLabel.stateRegion',  // Germany
  };

  selectedRegionCountryId = signal<number | null>(null);

  regionLabelKey = computed<string>(() => {
    const id = this.selectedRegionCountryId();
    if (!id) return 'components.businessForm.regionLabel.default'; // "Region"
    const iso2 = this.geoCountries().find(c => String(c.id) === String(id))?.iso2?.toUpperCase();
    return (iso2 && BusinessFormModalComponent.REGION_LABEL_KEYS[iso2])
      || 'components.businessForm.regionLabel.fallback'; // "State / Province / Region"
  });

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

  // Opening days & hours are owned entirely by app-opening-hours-editor,
  // which binds to the `openingHoursJson` control, marks it touched through
  // the CVA and reports its own validity — nothing to track here.

  // Auto-generated maps link tracking
  mapsLinkAutoGenerated = signal(false);
  mapsLinkUserEdited = signal(false);

  businessForm!: FormGroup;

  constructor() {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.loadCategoriesIfNeeded();
      this.loadGeoCountriesIfNeeded();
      this.loadPhoneCountriesIfNeeded();
      if (this.editBusinessId) {
        this.loadForEdit(this.editBusinessId);
      } else {
        this.resetForCreate();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
      // Optional in every country now — applyPincodeValidators() only ever
      // adds the country's format check, never Validators.required.
      pincode:      ['', [postalCodeValidator(null)]],
      // Optional — enforced only as "at least one of phone/WhatsApp/email"
      // via atLeastOneContactValidator below, not individually required.
      phoneCountryId: [null],
      phone:        ['', [Validators.maxLength(15), this.phoneValidator()]],
      // Structured days + hours in one control. The editor component is
      // both the CVA and the validator, so `required` here only guards the
      // null/empty case and the per-day rules live with the editor.
      openingHoursJson: [null as OpeningHoursJson | null, Validators.required],
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
      // Country Based is the default, matching the DB column default.
      visibilityType: ['COUNTRY', Validators.required],
      // Phone/WhatsApp/Email are each individually optional, but the group
      // needs at least one — Angular already re-runs group-level validators
      // whenever any child control's value changes, so this rule clears
      // itself the moment it's satisfied without any extra wiring here.
    }, { validators: atLeastOneContactValidator });

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
      error: () => this.toast.error('components.businessForm.toast.categoriesFailed'),
    });
  }

  private loadGeoCountriesIfNeeded(): void {
    if (this.geoCountries().length) return;
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.geoCountries.set(data),
      error: () => this.toast.error('components.businessForm.toast.countriesFailed'),
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
    const india = this.phoneCountries().find((c) => c.iso2 === 'IN');
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
    // A bare reset() nulls every control not explicitly listed here — not
    // just `isActive`/`visibilityType`, but also every optional text field
    // (pincode, phone, email, website, whatsapp, mapsLink, country,
    // latitude, longitude). The backend DTO types those as `string |
    // undefined`, never `null`, so a business submitted without ever
    // touching one of those optional fields (very possible now that they're
    // no longer required) would fail backend validation with "Expected
    // string, received null" the moment it reached the API. Restore them
    // all to the same '' default initForm() uses.
    this.businessForm.reset({
      pincode: '', phone: '', email: '', website: '', whatsapp: '',
      mapsLink: '', country: '', latitude: '', longitude: '',
      isActive: true, visibilityType: 'COUNTRY',
    });
    this.businessSubmitAttempted.set(false);
    // reset() clears phoneCountryId/whatsappCountryId — re-apply the India
    // default (applyDefaultPhoneCountry() only auto-fills them once, on first load).
    this.applyDefaultPhoneCountry();
    this.selectedLogo.set(null); this.logoPreview.set(null);
    this.clearGalleryState();
    this.resetDivisionState();
    this.selectedRegionCountryId.set(null);
    this.applyDivisionValidators();
    this.applyPincodeValidators();
    this.logoUploadReset.update(v => v + 1);
    if (this.defaultCategoryId) this.businessForm.get('categoryId')?.setValue(this.defaultCategoryId);
  }

  private loadForEdit(id: string): void {
    this.svc.getBusiness(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (biz) => this.applyEditFormData(biz),
      error: () => { this.toast.error('components.businessForm.toast.detailsFailed'); this.closed.emit(); },
    });
  }

  private applyEditFormData(biz: Business): void {
    this.editingBusiness.set(biz);
    this.businessSubmitAttempted.set(false);

    // Structured hours when the business has them; otherwise reconstruct
    // them from the two legacy free-text fields, so editing a business
    // created before this feature pre-fills the editor instead of showing
    // an empty required field. Unparsable free text falls through as null.
    const openingHoursJson = biz.openingHoursJson
      ?? parseLegacyOpeningHours(
        biz.openingDays ?? (biz as any).opening_days ?? null,
        biz.openingHours ?? (biz as any).opening_hours ?? null,
      );

    this.businessForm.patchValue({
      name:         biz.name         ?? '',
      description:  biz.description  ?? '',
      categoryId:   biz.categoryId   ?? (biz as any).category_id ?? biz.category?.id ?? '',
      address:      biz.address      ?? '',
      pincode:      biz.pincode      ?? '',
      email:        biz.email        ?? '',
      website:      biz.website      ?? '',
      mapsLink:     biz.mapsLink     ?? (biz as any).maps_link ?? '',
      openingHoursJson,
      country:      biz.country      ?? '',
      latitude:     biz.latitude     ?? '',
      longitude:    biz.longitude    ?? '',
      isActive:     biz.isActive     ?? true,
      visibilityType: biz.visibilityType ?? (biz as any).visibility_type ?? 'COUNTRY',
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

    // Logo
    const logoUrl = biz.logo ?? (biz.images?.length ? biz.images[0] : null);
    this.selectedLogo.set(null);
    this.logoPreview.set(logoUrl ?? null);
    this.logoUploadReset.update(v => v + 1);

    this.clearGalleryState();
    this.existingGalleryImages.set([...(biz.images ?? [])]);
    this.existingMenuImages.set([...(biz.menuImages ?? (biz as any).menu_images ?? [])]);
    this.existingCardImages.set([...(biz.cardImages ?? (biz as any).card_images ?? [])]);

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
    // Set silently below (no valueChanges), so the region label's own
    // signal needs updating explicitly here rather than via onCountryChange.
    this.selectedRegionCountryId.set(countryId);
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

  // Postal Code is optional in every country — this only ever applies the
  // selected country's format check (when a value is actually entered),
  // never a required rule, regardless of what the country's own postal
  // config says.
  private applyPincodeValidators(): void {
    const postal = this.countryConfig()?.postalCode;
    const ctrl = this.businessForm.get('pincode');
    ctrl?.setValidators([postalCodeValidator(postal?.regex ?? null)]);
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
    this.selectedRegionCountryId.set(id);
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
      error: () => this.toast.error('components.businessForm.toast.addressFailed'),
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

  /** Newly picked files for one gallery — `gallery` comes from GALLERIES. */
  onGalleryFilesChange(gallery: { selected: WritableSignal<File[]> }, files: File[]): void {
    gallery.selected.set(files);
  }

  /** Drops one already-uploaded image from a gallery's kept-list. */
  removeExistingGalleryImage(gallery: { existing: WritableSignal<string[]> }, url: string): void {
    gallery.existing.update(list => list.filter(i => i !== url));
  }

  /** Clears every gallery's picked files, kept-list and uploader. */
  private clearGalleryState(): void {
    for (const g of this.GALLERIES) {
      g.selected.set([]);
      g.existing.set([]);
      g.reset.update(v => v + 1);
    }
  }

  /** True once the user has actually edited something — patchValue() during
   * edit-data hydration never marks the form dirty, only real input does. */
  isDirty(): boolean {
    return this.open && this.businessForm.dirty;
  }

  // Browser tab close/refresh isn't something Angular Router (or this
  // component) can intercept with a custom prompt — this is the one
  // browser-supported hook for that case. The browser shows its own fixed
  // wording regardless of what's set here; only setting returnValue at all
  // triggers it.
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  /** Backdrop click, the × button, and Cancel all route through here, so this is the one place that needs to guard against discarding unsaved edits. */
  async requestClose(): Promise<void> {
    if (this.isDirty()) {
      const leave = await this.unsavedChanges.confirm();
      if (!leave) return;
    }
    this.closed.emit();
  }

  submitBusiness(): void {
    this.businessSubmitAttempted.set(true);
    this.businessForm.markAllAsTouched();
    // Logo is optional — no logoPreview() check here anymore.
    if (this.businessForm.invalid) {
      // The "at least one contact method" rule is a form-level error, not
      // tied to any single highlighted field, so nothing on screen points
      // at it unless we scroll there ourselves.
      if (this.businessForm.errors?.['noContactMethod']) {
        document.getElementById('bizFormContactSection')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

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

    // Nested objects can't survive FormData, so the structured hours go as
    // a JSON string. `openingDays` is still derived and sent so the value
    // is right even on the plain-JSON (no files) path.
    const hours = raw['openingHoursJson'] as OpeningHoursJson | null;
    raw['openingHoursJson'] = hours ? JSON.stringify(hours) : '';
    raw['openingDays'] = deriveLegacyDays(hours);

    delete raw['phoneCountryId'];
    delete raw['whatsappCountryId'];

    const editing = this.editingBusiness();
    if (editing) {
      // The images in each gallery the user didn't remove, sent alongside
      // any newly uploaded files so the backend rebuilds the full gallery
      // (kept + new) instead of the new upload wiping everything out.
      // JSON strings, not arrays: an empty array would vanish from the
      // FormData entirely and read as "gallery untouched".
      raw['existingImages'] = JSON.stringify(this.existingGalleryImages());
      raw['existingMenuImages'] = JSON.stringify(this.existingMenuImages());
      raw['existingCardImages'] = JSON.stringify(this.existingCardImages());
    }

    const files = {
      images: this.selectedImages(),
      menuImages: this.selectedMenuImages(),
      cardImages: this.selectedCardImages(),
      logo: this.selectedLogo() ?? undefined,
    };

    const req = editing
      ? this.svc.updateBusiness(editing.id, raw, files)
      : this.svc.createBusiness(raw, files);

    req.subscribe({
      next: (biz) => {
        if (biz.status === 'PENDING') {
          this.toast.success(editing ? 'components.businessForm.toast.resubmitted' : 'components.businessForm.toast.submitted');
        } else {
          this.toast.success(editing ? 'components.businessForm.toast.updated' : 'components.businessForm.toast.created');
        }
        this.submitting.set(false);
        this.saved.emit(biz);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error(editing ? 'components.businessForm.toast.updateFailed' : 'components.businessForm.toast.createFailed');
        this.submitting.set(false);
      },
    });
  }
}
