import { Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subject, takeUntil, Observable, map } from 'rxjs';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { GeographyService } from '../../../core/services/geography.service';
import { ToastService } from '../../../core/services/toast.service';
import { UnsavedChangesService } from '../../../core/services/unsaved-changes.service';
import { Event as AppEvent, EventCategory, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';
import { RadioGroupComponent, RadioOption } from '../radio-group/radio-group.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { TimeInputComponent } from '../time-input/time-input.component';
import { DateInputComponent } from '../date-input/date-input.component';
import { QrCodeComponent } from '../qr-code/qr-code.component';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { urlValidator } from '../../validators/url.validator';

function futureDateValidator(c: AbstractControl): ValidationErrors | null {
  if (!c.value) return null;
  return new Date(c.value) < new Date(new Date().toDateString()) ? { pastDate: true } : null;
}
// A single-day event is allowed to run past midnight (e.g. 22:00 -> 02:00) —
// that just means it ends the next day, not that the times are invalid. The
// only genuinely invalid combination left is a zero-length event.
function endTimeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('eventTime')?.value;
  const end   = group.get('eventEndTime')?.value;
  if (start && end && start === end) return { sameTime: true };
  return null;
}

/** Minutes since midnight for a 24h `HH:mm` string. */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export interface TimeRangeInfo {
  /** e.g. "2h 30m", "45m", "3h". */
  durationLabel: string;
  /** True when the end time is on or before the start time, i.e. it lands the next calendar day. */
  overnight: boolean;
}

/** Duration + overnight hint for the Start/End time pair, or null once either side is empty. */
function describeTimeRange(start: string, end: string): TimeRangeInfo | null {
  if (!start || !end || start === end) return null;
  const startMin = toMinutes(start);
  let endMin = toMinutes(end);
  const overnight = endMin <= startMin;
  if (overnight) endMin += 24 * 60;
  const diff = endMin - startMin;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  const durationLabel = hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`;
  return { durationLabel, overnight };
}

/** Fails when the trimmed value is empty (catches whitespace-only strings). */
function noWhitespace(control: AbstractControl): ValidationErrors | null {
  const val = ((control.value as string) ?? '').trim();
  return val.length === 0 ? { whitespace: true } : null;
}

/**
 * Fails when the trimmed value is shorter than `min`.
 * Does NOT fail on empty/null (let `required` + `noWhitespace` handle that).
 */
function minLengthTrimmed(min: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = ((control.value as string) ?? '').trim();
    return val.length > 0 && val.length < min
      ? { minlengthTrimmed: { requiredLength: min, actualLength: val.length } }
      : null;
  };
}

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'];

/** Country-aware postal code validator — same as job-form-modal/business-form-modal's identical helper. */
function postalCodeValidator(regex: string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v || !regex) return null;
    try { return new RegExp(regex).test(v) ? null : { postalFormat: true }; }
    catch { return null; }
  };
}

/** Sensible default timezone per country (ISO2), for the countries already
 * covered by the curated TIMEZONES list above — only ever applied while the
 * timezone control is still pristine, so a manual choice is never clobbered. */
const COUNTRY_DEFAULT_TIMEZONE: Record<string, string> = {
  IN: 'Asia/Kolkata', AE: 'Asia/Dubai', GB: 'Europe/London', FR: 'Europe/Paris',
  US: 'America/New_York', SG: 'Asia/Singapore', AU: 'Australia/Sydney', CA: 'America/New_York',
};

/**
 * The single Add/Edit Event form modal — mirrors business-form-modal's
 * contract (open / editEventId / isAdmin inputs, closed / saved outputs) so
 * the user Events page and the admin Events page share one implementation
 * instead of keeping two copies of the form in sync by hand.
 */
@Component({
  selector: 'app-event-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelectComponent, RadioGroupComponent, FileUploadComponent, TimeInputComponent, DateInputComponent, QrCodeComponent, ImageUrlPipe, TranslatePipe, ScrollLockDirective],
  templateUrl: './event-form-modal.component.html',
  styleUrls: ['./event-form-modal.component.scss'],
})
export class EventFormModalComponent implements OnChanges, OnDestroy {
  private eventService      = inject(EventService);
  private authService       = inject(AuthService);
  private geographyService  = inject(GeographyService);
  private toast             = inject(ToastService);
  private fb                = inject(FormBuilder);
  private unsavedChanges    = inject(UnsavedChangesService);
  private destroy$          = new Subject<void>();

  @Input() open = false;
  @Input() editEventId: string | null = null;
  /** Rendered inside the admin console. Only affects copy — authorization stays entirely server-side. */
  @Input() isAdmin = false;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful create/update; the host is responsible for updating its own list state. */
  @Output() saved = new EventEmitter<AppEvent>();

  submitting           = signal(false);
  formSubmitAttempted  = signal(false);
  editingEvent         = signal<AppEvent | null>(null);

  selectedImage = signal<File | null>(null);
  existingImage = signal<string | null>(null);

  // ── Category — admin-manageable, DB-backed (event_categories table) ──
  categories = signal<EventCategory[]>([]);
  private categoriesLoaded = false;
  /** Disabled categories are hidden from selection, EXCEPT the one already
   * set on the event being edited — so an old/disabled category never goes
   * blank in its own edit form, it's just not offered for anything else. */
  categoryOptions = computed<SelectOption[]>(() => {
    const editingName = this.editingEvent()?.eventCategory ?? null;
    return this.categories()
      .filter((c) => c.isActive !== false || c.name === editingName)
      .map((c) => ({ value: c.name, label: c.name, icon: c.icon }));
  });

  readonly timezoneOptions: SelectOption[] = TIMEZONES.map((t) => ({ value: t, label: t }));

  readonly eventModeOptions: RadioOption[] = [
    { value: 'Offline', label: 'user.events.modeOption.offline', icon: 'bi-geo-alt-fill' },
    { value: 'Online',  label: 'user.events.modeOption.online',  icon: 'bi-camera-video-fill' },
    { value: 'Hybrid',  label: 'user.events.modeOption.hybrid',  icon: 'bi-diagram-2-fill' },
  ];

  // ── Visibility — Country Based is the default (matches the DB column
  // default). Events-owned wording (not Business's "...as this business."
  // hint) — see user.events.visibility.* in en.json/ta.json. ──
  readonly visibilityOptions: RadioOption[] = [
    { value: 'COUNTRY', label: 'user.events.visibility.countryLabel', icon: 'bi-geo-alt-fill' },
    { value: 'WORLDWIDE', label: 'user.events.visibility.worldwideLabel', icon: 'bi-globe2' },
  ];

  // ── Country (id-based, from the geography master data — same source Business/Jobs use) ──
  countries = signal<GeoCountry[]>([]);
  private countriesLoaded = false;
  countryOptions = computed<SelectOption[]>(() =>
    this.countries().map((c) => ({ value: c.id, label: `${c.flagEmoji ?? ''} ${c.name}`.trim() }))
  );

  // ── Location cascade — Country -> State/Province/Region -> City -> Venue
  // -> Address -> Pincode. Same shared geography service (country-specific
  // division labels derived from real imported data, not a hardcoded map)
  // already used by Jobs/Business — mirrors job-form-modal.component.ts's
  // identical cascade. Only rendered inside the Offline/Hybrid panel;
  // Country itself stays visible for Online too since it also drives
  // Visibility scoping below. ──
  countryConfig = signal<CountryAddressConfig | null>(null);
  division1Options = signal<Division[]>([]);
  division2Options = signal<Division[]>([]);
  division1Loading = signal(false);
  division2Loading = signal(false);
  division1SelectOptions = computed<SelectOption[]>(() => this.division1Options().map((d) => ({ value: d.id, label: d.name })));
  division2SelectOptions = computed<SelectOption[]>(() => this.division2Options().map((d) => ({ value: d.id, label: d.name })));
  adminLevels = computed(() => this.countryConfig()?.divisionLevels ?? []);

  selectedDivision1Name = signal<string | null>(null);
  selectedDivision2Name = signal<string | null>(null);
  selectedCityOption    = signal<SelectOption | null>(null);
  selectedCityName      = signal<string | null>(null);

  // Country-specific label for the State/Province/Region field — same
  // curated ISO2 -> i18n-key override as job-form-modal.component.ts's
  // regionLabelKey, layered on top of the backend's own data-driven label
  // purely so it's translatable; falls back to a generic label for any
  // country not in this short list.
  private static readonly REGION_LABEL_KEYS: Record<string, string> = {
    GB: 'components.jobForm.regionLabel.county',
    IN: 'components.jobForm.regionLabel.state',
    DE: 'components.jobForm.regionLabel.state',
    CA: 'components.jobForm.regionLabel.province',
  };
  selectedRegionCountryId = signal<number | null>(null);
  regionLabelKey = computed<string>(() => {
    const id = this.selectedRegionCountryId();
    if (!id) return 'components.jobForm.regionLabel.default';
    const iso2 = this.countries().find((c) => String(c.id) === String(id))?.iso2?.toUpperCase();
    return (iso2 && EventFormModalComponent.REGION_LABEL_KEYS[iso2]) || 'components.jobForm.regionLabel.fallback';
  });

  private cityNameCache = new Map<number, string>();
  citySearchFn = (query: string): Observable<SelectOption[]> => {
    const countryId  = this.eventForm.get('countryId')?.value ? Number(this.eventForm.get('countryId')?.value) : undefined;
    const divisionId = this.getLeafDivisionId() ?? undefined;
    if (!countryId) return new Observable<SelectOption[]>((sub) => { sub.next([]); sub.complete(); });
    return this.geographyService.searchCities({ divisionId, countryId: divisionId ? undefined : countryId, search: query, page: 1, limit: 20 }).pipe(
      map((res) => {
        res.data.forEach((c) => this.cityNameCache.set(c.id, c.name));
        return res.data.map((c) => ({ value: c.id, label: c.name }));
      }),
    );
  };

  // Image upload — surfaces a server-side validation rejection (bad
  // dimensions, format mismatch, disallowed type) as an inline message next
  // to the upload control itself, not just a toast (mirrors
  // community-form-modal's [showError]/[errorMessage] pattern).
  imageUploadError = signal<string | null>(null);

  private userPincode = computed(() => this.authService.currentUser()?.pincode ?? '');

  eventForm!: FormGroup;

  get eventMode(): string { return this.eventForm?.get('eventMode')?.value ?? ''; }
  get showAddress(): boolean      { return this.eventMode === 'Offline' || this.eventMode === 'Hybrid'; }
  get showLocationLink(): boolean { return this.eventMode === 'Online'  || this.eventMode === 'Hybrid'; }

  get f() { return this.eventForm.controls; }

  /** Duration/overnight hint below the Start/End time fields — re-evaluated each change-detection pass, which is cheap enough here. */
  protected timeRangeInfo(): TimeRangeInfo | null {
    return describeTimeRange(this.f['eventTime'].value ?? '', this.f['eventEndTime'].value ?? '');
  }

  /** Drives the QR preview box's three states so its footprint never changes size/position as the field is filled in. */
  protected bookingQrState(): 'empty' | 'invalid' | 'valid' {
    const ctrl = this.f['bookingUrl'];
    if (!ctrl.value) return 'empty';
    return ctrl.invalid ? 'invalid' : 'valid';
  }

  protected async copyBookingUrl(): Promise<void> {
    const url = this.f['bookingUrl'].value as string;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('user.events.bookingUrlCopied');
    } catch {
      this.toast.error('user.events.bookingUrlCopyFailed');
    }
  }

  /** Guards the resurrection effect below against re-running for the same
   * event once it's already resurrected (e.g. if `countries()` happens to
   * emit again) — reset to null on every create/edit-load. */
  private resurrectedForEventId: string | null = null;

  constructor() {
    this.initForm();

    // Full location-cascade resurrection for an event being edited, once
    // both the event and the master country list are available (order
    // between the two async loads isn't guaranteed). Falls back to matching
    // the free-text country name for an event with no country_id at all.
    // Runs once per event id, not merely "while countryId is still empty" —
    // eventForm.reset() in applyEditFormData() already sets countryId
    // synchronously from evt.countryId, so gating on "is it still empty"
    // would skip resurrection for every event that already has one.
    effect(() => {
      const evt = this.editingEvent();
      const list = this.countries();
      if (!evt || !list.length) return;
      if (this.resurrectedForEventId === evt.id) return;
      this.resurrectedForEventId = evt.id;
      this.resurrectEventLocation(evt);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.loadCountriesIfNeeded();
      this.loadCategoriesIfNeeded();
      if (this.editEventId) {
        this.loadForEdit(this.editEventId);
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
    this.eventForm = this.fb.group({
      title:        ['', [Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(100)]],
      description:  ['', [Validators.required, noWhitespace, minLengthTrimmed(10), Validators.maxLength(1000)]],
      eventCategory:['', Validators.required],
      eventDate:    ['', [Validators.required, futureDateValidator]],
      eventTime:    ['', Validators.required],
      eventEndTime: [''],
      timezone:     ['Asia/Kolkata', Validators.required],
      eventMode:    ['Offline', Validators.required],
      address:      ['', [Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(200)]],
      locationLink: ['', Validators.maxLength(300)],
      pincode:      ['', Validators.maxLength(12)],
      location:     ['', Validators.maxLength(150)],
      countryId:    [null],
      // Leaf-of-hierarchy ids — see geo cascade section below. Never
      // required on their own (Offline/Hybrid already requires the
      // free-text `address`, matching Jobs' identical reasoning: most
      // existing events predate these id columns entirely).
      division1Id:  [null],
      division2Id:  [null],
      cityId:       [null],
      // Country Based is the default, matching the DB column default.
      visibilityType: ['COUNTRY', Validators.required],
      // Optional — attendees can scan the QR (rendered live from this value) or follow the link.
      bookingUrl:   ['', [urlValidator, Validators.maxLength(500)]],
    }, { validators: endTimeValidator });

    this.applyModeValidators(this.eventForm.get('eventMode')!.value);
    this.eventForm.get('eventMode')!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      this.applyModeValidators(mode);
      // Online events never carry physical-location data (matches the
      // backend's same defensive nulling in events.service.ts) — a stale
      // address entered while Offline/Hybrid must not silently survive a
      // switch to Online and get submitted anyway.
      if (mode === 'Online') {
        const silent = { emitEvent: false };
        this.eventForm.get('address')?.setValue('', silent);
        this.eventForm.get('pincode')?.setValue('', silent);
        this.eventForm.get('location')?.setValue('', silent);
        this.eventForm.get('division1Id')?.setValue(null, silent);
        this.eventForm.get('division2Id')?.setValue(null, silent);
        this.eventForm.get('cityId')?.setValue(null, silent);
        this.selectedDivision1Name.set(null);
        this.selectedDivision2Name.set(null);
        this.selectedCityOption.set(null);
        this.selectedCityName.set(null);
      }
    });
  }

  /** (Re)apply the conditional required/format validators for address & meeting link based on event mode. */
  private applyModeValidators(mode: string): void {
    const addr = this.eventForm.get('address')!;
    const link = this.eventForm.get('locationLink')!;

    if (mode === 'Offline') {
      addr.setValidators([Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(200)]);
      link.setValidators([urlValidator, Validators.maxLength(300)]);
    } else if (mode === 'Online') {
      addr.setValidators([Validators.maxLength(200)]);
      link.setValidators([Validators.required, urlValidator, Validators.maxLength(300)]);
    } else if (mode === 'Hybrid') {
      addr.setValidators([Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(200)]);
      link.setValidators([Validators.required, urlValidator, Validators.maxLength(300)]);
    }

    addr.updateValueAndValidity({ emitEvent: false });
    link.updateValueAndValidity({ emitEvent: false });
  }

  // ── Location cascade methods — mirror job-form-modal.component.ts's
  // identical Country -> Division -> City methods exactly. ──

  private getLeafDivisionId(): number | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) { const v = this.eventForm.get('division2Id')?.value; return v ? Number(v) : null; }
    if (levels === 1) { const v = this.eventForm.get('division1Id')?.value; return v ? Number(v) : null; }
    return null;
  }

  private applyDivisionValidators(): void {
    const d1 = this.eventForm.get('division1Id');
    const d2 = this.eventForm.get('division2Id');
    d1?.setValidators([]);
    d2?.setValidators([]);
    d1?.updateValueAndValidity({ emitEvent: false });
    d2?.updateValueAndValidity({ emitEvent: false });
  }

  private applyPincodeValidators(): void {
    const postal = this.countryConfig()?.postalCode;
    const ctrl = this.eventForm.get('pincode');
    ctrl?.setValidators([postalCodeValidator(postal?.regex ?? null), Validators.maxLength(12)]);
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
    this.eventForm.get('division1Id')?.setValue(null, silent);
    this.eventForm.get('division2Id')?.setValue(null, silent);
    this.eventForm.get('cityId')?.setValue(null, silent);
  }

  /** Also applies the country-based default timezone — only while the
   * timezone control is still pristine, so a deliberate manual choice is
   * never overwritten. */
  onCountryChange(countryId: any): void {
    this.resetDivisionState();
    const id = countryId ? Number(countryId) : null;
    this.selectedRegionCountryId.set(id);

    const tzCtrl = this.eventForm.get('timezone');
    if (tzCtrl?.pristine) {
      const iso2 = id ? this.countries().find((c) => c.id === id)?.iso2?.toUpperCase() : undefined;
      const defaultTz = iso2 ? COUNTRY_DEFAULT_TIMEZONE[iso2] : undefined;
      if (defaultTz) tzCtrl.setValue(defaultTz, { emitEvent: false });
    }

    if (!id) { this.applyDivisionValidators(); this.applyPincodeValidators(); return; }

    this.geographyService.getCountryConfig(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        this.applyDivisionValidators();
        this.applyPincodeValidators();
        if (config.divisionLevels.length > 0) {
          this.division1Loading.set(true);
          this.geographyService.getDivisions(id).pipe(takeUntil(this.destroy$)).subscribe({
            next: (divisions) => { this.division1Options.set(divisions); this.division1Loading.set(false); },
            error: () => this.division1Loading.set(false),
          });
        }
      },
      error: () => this.toast.error('user.jobs.toast.failedLoadCountryAddressDetails'),
    });
  }

  onDivision1Change(divisionId: any): void {
    this.eventForm.get('division2Id')?.setValue(null);
    this.eventForm.get('cityId')?.setValue(null);
    this.division2Options.set([]);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);

    const id = divisionId ? Number(divisionId) : null;
    this.selectedDivision1Name.set(id ? (this.division1Options().find((d) => d.id === id)?.name ?? null) : null);

    const countryId = this.eventForm.get('countryId')?.value ? Number(this.eventForm.get('countryId')?.value) : null;
    if (id && countryId && this.adminLevels().length >= 2) {
      this.division2Loading.set(true);
      this.geographyService.getDivisions(countryId, id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (divisions) => { this.division2Options.set(divisions); this.division2Loading.set(false); },
        error: () => this.division2Loading.set(false),
      });
    }
  }

  onDivision2Change(divisionId: any): void {
    this.eventForm.get('cityId')?.setValue(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);
    const id = divisionId ? Number(divisionId) : null;
    this.selectedDivision2Name.set(id ? (this.division2Options().find((d) => d.id === id)?.name ?? null) : null);
  }

  onCityChange(cityId: any): void {
    const id = cityId ? Number(cityId) : null;
    const name = id ? (this.cityNameCache.get(id) ?? null) : null;
    this.selectedCityName.set(name);
    this.selectedCityOption.set(id ? { value: id, label: name ?? '' } : null);
  }

  /** Edit-mode resurrection — populates the cascade from the event's stored
   * stateId/cityId. Existing events created before this cascade existed
   * simply have both null, so their dropdowns stay empty while their
   * free-text address/location/pincode/country keep displaying exactly as
   * before (no data loss, no forced re-entry). */
  private resurrectEventLocation(evt: AppEvent): void {
    const silent = { emitEvent: false, emitViewToModelChange: false };
    this.resetDivisionState();

    const country = evt.countryId != null
      ? this.countries().find((c) => c.id === evt.countryId)
      : (evt.country ? this.countries().find((c) => c.name.toLowerCase() === evt.country!.toLowerCase()) : null);
    if (!country) { this.selectedRegionCountryId.set(null); this.applyDivisionValidators(); this.applyPincodeValidators(); return; }

    this.selectedRegionCountryId.set(country.id);
    this.eventForm.get('countryId')?.setValue(country.id, silent);
    this.geographyService.getCountryConfig(country.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        this.applyDivisionValidators();
        this.applyPincodeValidators();
        if (config.divisionLevels.length === 0) return;

        this.division1Loading.set(true);
        this.geographyService.getDivisions(country.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: (divisions) => {
            this.division1Options.set(divisions);
            this.division1Loading.set(false);
            if (evt.stateId == null) return;
            const match = divisions.find((d) => d.id === evt.stateId);
            if (!match) return;
            this.eventForm.get('division1Id')?.setValue(match.id, silent);
            this.selectedDivision1Name.set(match.name);
            if (evt.cityId != null) this.resurrectEventCity(match.id, evt.cityId);
          },
          error: () => this.division1Loading.set(false),
        });
      },
      error: () => {},
    });
  }

  private resurrectEventCity(divisionId: number, cityId: number): void {
    this.geographyService.searchCities({ divisionId, countryId: undefined, search: '', page: 1, limit: 20 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const match = res.data.find((c) => c.id === cityId);
          if (!match) return;
          const silent = { emitEvent: false, emitViewToModelChange: false };
          this.eventForm.get('cityId')?.setValue(match.id, silent);
          this.selectedCityName.set(match.name);
          this.selectedCityOption.set({ value: match.id, label: match.name });
          this.cityNameCache.set(match.id, match.name);
        },
        error: () => {},
      });
  }

  private loadCountriesIfNeeded(): void {
    if (this.countriesLoaded) return;
    this.countriesLoaded = true;
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => this.countries.set(data),
      error: () => {},
    });
  }

  /** Loads the full category list (not active-only) — an event being edited
   * may already have a disabled/legacy category, which categoryOptions()
   * above still needs in order to keep showing it correctly. */
  private loadCategoriesIfNeeded(): void {
    if (this.categoriesLoaded) return;
    this.categoriesLoaded = true;
    this.eventService.getCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => this.categories.set(data),
      error: () => {},
    });
  }

  private resetForCreate(): void {
    this.editingEvent.set(null);
    this.resurrectedForEventId = null;
    this.eventForm.reset({ timezone: 'Asia/Kolkata', eventMode: 'Offline', pincode: this.userPincode(), visibilityType: 'COUNTRY' });
    this.formSubmitAttempted.set(false);
    this.selectedImage.set(null);
    this.existingImage.set(null);
    this.imageUploadError.set(null);
    this.resetDivisionState();
    this.selectedRegionCountryId.set(null);
    this.applyModeValidators('Offline');
  }

  private loadForEdit(id: string): void {
    this.eventService.getEvent(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (evt) => this.applyEditFormData(evt),
      error: () => { this.toast.error('Failed to load event details'); this.closed.emit(); },
    });
  }

  private applyEditFormData(evt: AppEvent): void {
    this.editingEvent.set(evt);
    this.formSubmitAttempted.set(false);

    this.eventForm.reset({
      title: evt.title,
      description: evt.description ?? '',
      eventCategory: evt.eventCategory ?? '',
      eventDate: evt.eventDate ? evt.eventDate.substring(0, 10) : '',
      eventTime: evt.eventTime ?? '',
      eventEndTime: evt.eventEndTime ?? '',
      timezone: evt.timezone ?? 'Asia/Kolkata',
      eventMode: evt.eventMode ?? 'Offline',
      address: evt.address ?? '',
      locationLink: evt.locationLink ?? '',
      pincode: evt.pincode ?? '',
      location: evt.location ?? '',
      countryId: evt.countryId ?? null,
      division1Id: null,
      division2Id: null,
      cityId: null,
      visibilityType: evt.visibilityType ?? 'COUNTRY',
      bookingUrl: evt.bookingUrl ?? '',
    });
    this.applyModeValidators(this.eventForm.get('eventMode')!.value);
    // The location cascade itself (countryConfig/division options/state-city
    // resurrection) is populated reactively by the constructor's effect once
    // `countries()` is loaded — see resurrectEventLocation().

    this.selectedImage.set(null);
    this.existingImage.set(evt.images?.[0] ?? null);
    this.imageUploadError.set(null);
  }

  onImageChange(files: File[]): void {
    this.selectedImage.set(files[0] ?? null);
    this.imageUploadError.set(null);
  }

  /** Reused as-is from job-form-modal/business-form-modal's identical pattern —
   * the one shared "You have unsaved changes" dialog, driven by
   * UnsavedChangesService. `eventForm.reset(...)` (resetForCreate() /
   * applyEditFormData() above) puts the form back to pristine, so loading
   * a record for edit never counts as a change — only real input does. */
  isDirty(): boolean {
    return this.open && this.eventForm.dirty;
  }

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

  submitEvent(): void {
    // Belt-and-suspenders against a double-submit — the Save button's
    // [disabled]="submitting()" binding already prevents a second click in
    // practice, but this makes it impossible to re-enter the method itself.
    if (this.submitting()) return;

    this.formSubmitAttempted.set(true);
    this.eventForm.markAllAsTouched();
    if (this.eventForm.invalid) { this.scrollToFirstError(); return; }

    this.submitting.set(true);
    this.imageUploadError.set(null);
    const raw: Record<string, any> = { ...this.eventForm.value };

    // Resolve the country NAME string for the backward-compat display
    // column, alongside the id-based countryId already in `raw` from the form.
    const foundCountry = this.countries().find((c) => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = foundCountry.name;

    // division1Id/division2Id are form-internal (drive the cascade UI, not
    // stored directly) — resolve to the single leaf `stateId` the backend
    // expects, same as job-form-modal's buildJobPayload().
    raw['stateId'] = this.getLeafDivisionId() ?? undefined;
    delete raw['division1Id'];
    delete raw['division2Id'];

    const images = this.selectedImage() ? [this.selectedImage()!] : undefined;
    const editing = this.editingEvent();
    const req$ = editing
      ? this.eventService.updateEvent(editing.id, raw, images)
      : this.eventService.createEvent(raw, images);

    req$.subscribe({
      next: (evt) => {
        if (evt.status === 'PENDING' && (!editing || editing.status === 'REJECTED' || editing.status === 'NEEDS_INFO')) {
          this.toast.success(editing ? 'Event resubmitted for admin approval' : 'Event submitted for admin approval');
        } else if (editing) {
          this.toast.success('user.events.toast.eventUpdated');
        } else {
          this.toast.success('user.events.toast.eventCreated');
        }
        this.submitting.set(false);
        this.saved.emit(evt);
        this.closed.emit();
      },
      error: (err) => {
        // A FileValidationService rejection comes back with an
        // `invalidFiles` array — surface it inline next to the upload
        // control (mirrors community-form-modal's [showError]/[errorMessage]
        // pattern) in addition to the generic toast, instead of leaving the
        // user to guess which field the error actually refers to.
        const invalidFiles = err?.error?.invalidFiles as Array<{ filename: string; error: string }> | undefined;
        if (invalidFiles?.length) {
          this.imageUploadError.set(invalidFiles.map((f) => `${f.filename}: ${f.error}`).join('; '));
        }
        this.toast.error(err?.error?.message ?? 'Failed to save event');
        this.submitting.set(false);
      },
    });
  }

  /** Scrolls the modal body to the first visible error message. */
  private scrollToFirstError(): void {
    setTimeout(() => {
      const firstError = document.querySelector<HTMLElement>('.cm-error-msg');
      firstError
        ?.closest<HTMLElement>('.cm-field-group, .cm-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }
}
