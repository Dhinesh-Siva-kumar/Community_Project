import {
  Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators,
  AbstractControl, ValidationErrors, ValidatorFn,
} from '@angular/forms';
import { Subject, takeUntil, Observable, map } from 'rxjs';

import { JobService } from '../../../core/services/job.service';
import { MasterDataService } from '../../../core/services/master-data.service';
import { GeographyService } from '../../../core/services/geography.service';
import { ToastService } from '../../../core/services/toast.service';
import { Country, Job, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';
import { RadioGroupComponent, RadioOption } from '../radio-group/radio-group.component';
import { TimeInputComponent } from '../time-input/time-input.component';
import { DateInputComponent } from '../date-input/date-input.component';
import { ToggleComponent } from '../toggle/toggle.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { TagInputComponent } from '../tag-input/tag-input.component';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { ImageErrorHandlerDirective } from '../../directives/image-error-handler.directive';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { CURRENCIES, getCurrencySymbol, getCurrencySelectOptions } from '../../constants/currencies';
import { getPhoneRule } from '../../utils/phone';
import { enumSelectOptions } from '../../constants/enum-labels';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UnsavedChangesService } from '../../../core/services/unsaved-changes.service';

function urlValidator(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (!v || v === '') return null;
  try {
    const url = new URL(v);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { invalidUrl: 'URL must start with http:// or https://' };
    }
    return null;
  } catch {
    return { invalidUrl: 'Please enter a valid URL (e.g. https://example.com)' };
  }
}

function salaryRangeValidator(group: AbstractControl): ValidationErrors | null {
  const min = group.get('salaryMin')?.value;
  const max = group.get('salaryMax')?.value;
  if (min != null && max != null && min !== '' && max !== '' && Number(max) < Number(min)) {
    return { salaryRange: true };
  }
  return null;
}

function expRangeValidator(group: AbstractControl): ValidationErrors | null {
  const min = group.get('expMin')?.value;
  const max = group.get('expMax')?.value;
  if (min != null && max != null && min !== '' && max !== '' && Number(max) < Number(min)) {
    return { expRange: true };
  }
  return null;
}

/** Openings: a whole number of 1 or more. `Validators.min` alone lets a
 * decimal like 1.5 through (it only checks the numeric floor, not
 * integer-ness) and silently skips validation entirely once the control is
 * empty/null — paired with Validators.required here to actually catch that. */
function wholeNumberMinValidator(min: number): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = c.value;
    if (v === null || v === undefined || v === '') return null; // Validators.required covers emptiness
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) return { wholeNumberMin: { min } };
    return null;
  };
}

/** Country-aware postal code validator — see business-form-modal.component.ts for the fuller explanation. */
function postalCodeValidator(regex: string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v || !regex) return null;
    try { return new RegExp(regex).test(v) ? null : { postalFormat: true }; }
    catch { return null; }
  };
}

/**
 * The single Post/Edit Job form modal, styled to match
 * `app-community-form-modal`'s design system (`.cm-*` classes) rather than
 * the older `.jb-form-section` card-per-section look the Business form used
 * — this is what "Post a New Job popup" specifically asked to match.
 *
 * Shared by the user Jobs page and the admin console, replacing what used
 * to be two ~1500-line near-identical copies of this form.
 */
@Component({
  selector: 'app-job-form-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, RadioGroupComponent,
    TimeInputComponent, DateInputComponent, ToggleComponent, FileUploadComponent, TagInputComponent, ImageUrlPipe,
    ImageErrorHandlerDirective, TranslatePipe, ScrollLockDirective,
  ],
  templateUrl: './job-form-modal.component.html',
  styleUrls: ['./job-form-modal.component.scss'],
})
export class JobFormModalComponent implements OnChanges, OnDestroy {
  private jobService        = inject(JobService);
  private masterDataService = inject(MasterDataService);
  private geographyService  = inject(GeographyService);
  private toast             = inject(ToastService);
  private translate         = inject(TranslateService);
  private fb                = inject(FormBuilder);
  private unsavedChanges    = inject(UnsavedChangesService);
  private destroy$          = new Subject<void>();

  @Input() open = false;
  @Input() editJobId: string | null = null;
  /**
   * Rendered inside the admin console. Only affects copy — the admin page
   * uses this same modal rather than keeping its own duplicate of the form.
   * Authorization stays entirely server-side (admin creates auto-approve
   * regardless of what this flag says).
   */
  @Input() isAdmin = false;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful create/update; the host updates its own list state. */
  @Output() saved = new EventEmitter<Job>();

  submitting              = signal(false);
  jobSubmitAttempted      = signal(false);
  editingJob              = signal<Job | null>(null);

  jobForm!: FormGroup;

  // ── Images / logo ──
  selectedImages  = signal<File[]>([]);
  selectedLogo    = signal<File | null>(null);
  logoPreview     = signal<string | null>(null);
  fileUploadReset = signal(0);
  logoUploadReset = signal(0);

  // ── Phone countries (dial-code dropdown) ──
  phoneCountries = signal<Country[]>([]);
  private phoneCountriesLoaded = false;
  dialCodeOptions = computed<SelectOption[]>(() =>
    this.phoneCountries().map(c => ({ value: c.dial_code, label: `${c.flag_emoji ?? ''} ${c.dial_code}`.trim() })),
  );

  // ── Location — Country → Division(s) → City → Postal cascade ──
  // Jobs stores only plain city/state/country strings (no ids) on legacy
  // rows, so on submit the leaf division/city NAME is resolved and written
  // into those string columns alongside the new id columns.
  geoCountries  = signal<GeoCountry[]>([]);
  private geoCountriesLoaded = false;
  countryConfig = signal<CountryAddressConfig | null>(null);
  adminLevels   = computed(() => this.countryConfig()?.divisionLevels ?? []);

  // Country-specific label for the level-1 division field, replacing the
  // generic backend-derived label (e.g. Germany's "Land") with wording
  // that reads naturally for a Job posting. A plain computed() can't react
  // to a FormControl read directly, so the selected country id is tracked
  // in its own signal, kept in sync at every mutation site (onCountryChange,
  // resurrectJobLocation, resetForCreate) — same approach as
  // business-form-modal's regionLabelKey.
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
    const iso2 = this.geoCountries().find(c => String(c.id) === String(id))?.iso2?.toUpperCase();
    return (iso2 && JobFormModalComponent.REGION_LABEL_KEYS[iso2])
      || 'components.jobForm.regionLabel.fallback';
  });

  geoCountryOptions = computed<SelectOption[]>(() =>
    this.geoCountries().map(c => ({ value: c.id, label: `${c.flagEmoji ?? ''} ${c.name}`.trim() })),
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
    const countryId  = this.jobForm.get('countryId')?.value ? Number(this.jobForm.get('countryId')?.value) : undefined;
    const divisionId = this.getLeafDivisionId() ?? undefined;
    if (!countryId) return new Observable<SelectOption[]>(sub => { sub.next([]); sub.complete(); });
    return this.geographyService.searchCities({ divisionId, countryId: divisionId ? undefined : countryId, search: query, page: 1, limit: 20 }).pipe(
      map(res => {
        res.data.forEach(c => this.cityNameCache.set(c.id, c.name));
        return res.data.map(c => ({ value: c.id, label: c.name }));
      }),
    );
  };

  // ── Static option lists ──
  readonly jobTypes    = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
  readonly jobTypeOptions: SelectOption[] = enumSelectOptions('jobType', this.jobTypes);
  readonly workModeOptions: RadioOption[] = enumSelectOptions('workMode', ['Remote', 'Hybrid', 'On-site']);
  readonly shiftTypeOptions: RadioOption[] = enumSelectOptions('shiftType', ['Day', 'Night', 'Rotational', 'Flexible']);
  readonly visaSponsorshipOptions: RadioOption[] = enumSelectOptions('visaSponsorship', ['Available', 'Not Available', 'Not Specified']);
  readonly salaryTypeOptions: RadioOption[] = enumSelectOptions('salaryType', ['Fixed', 'Hourly', 'Monthly', 'Annual', 'Negotiable']);
  readonly workDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  readonly visibilityOptions: RadioOption[] = [
    { value: 'COUNTRY', label: 'components.businessForm.visibilityCountry', icon: 'bi-geo-alt-fill' },
    { value: 'WORLDWIDE', label: 'components.businessForm.visibilityWorldwide', icon: 'bi-globe2' },
  ];

  readonly currencyOptions: SelectOption[] = getCurrencySelectOptions();

  readonly educationOptions: SelectOption[] = [
    { value: 'None',       label: 'user.jobs.educationOption.none' },
    { value: '8th',        label: 'user.jobs.educationOption.8th' },
    { value: '10th',       label: 'user.jobs.educationOption.10th' },
    { value: '12th',       label: 'user.jobs.educationOption.12th' },
    { value: 'Diploma',    label: 'user.jobs.educationOption.diploma' },
    { value: 'ITI',        label: 'user.jobs.educationOption.iti' },
    { value: 'Any',        label: 'user.jobs.educationOption.any' },
    { value: "Bachelor's", label: 'enums.education.bachelors' },
    { value: "Master's",   label: 'enums.education.masters' },
    { value: 'PhD',        label: 'user.jobs.educationOption.phd' },
  ];

  readonly expOptions: SelectOption[] = [
    { value: 0,  label: 'user.jobs.exp.fresher0' },
    { value: 1,  label: 'user.jobs.exp.y1' },
    { value: 2,  label: 'user.jobs.exp.y2' },
    { value: 3,  label: 'user.jobs.exp.y3' },
    { value: 4,  label: 'user.jobs.exp.y4' },
    { value: 5,  label: 'user.jobs.exp.y5' },
    { value: 7,  label: 'user.jobs.exp.y7' },
    { value: 10, label: 'user.jobs.exp.y10' },
    { value: 15, label: 'user.jobs.exp.y15' },
  ];

  protected getCurrencySymbol(code: string | undefined): string { return getCurrencySymbol(code); }

  // `workMode` — not the separate `isRemote` control — is the single
  // source of truth for what's shown here; see subscribeToWorkMode().
  get isRemoteCtrl(): boolean { return this.jobForm.get('workMode')?.value === 'Remote'; }
  get isHybridCtrl(): boolean { return this.jobForm.get('workMode')?.value === 'Hybrid'; }
  get isSalaryHidden(): boolean { return !!this.jobForm.get('salaryHidden')?.value; }
  get isSalaryNegotiable(): boolean { return this.jobForm.get('salaryType')?.value === 'Negotiable'; }

  constructor() {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.loadPhoneCountriesIfNeeded();
      this.loadGeoCountriesIfNeeded();
      if (this.editJobId) {
        this.loadForEdit(this.editJobId);
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
    this.jobForm = this.fb.group({
      companyName:    ['', [Validators.required, Validators.minLength(2)]],
      companyWebsite: ['', urlValidator],
      title:          ['', [Validators.required, Validators.minLength(3)]],
      // No default — an unset value shows the "Select employment type"
      // placeholder rather than silently pre-selecting Full-time for every
      // new job regardless of what it actually is.
      jobType:        [null],
      workMode:       ['On-site'],
      education:      [''],
      openings:       [1, [Validators.required, wholeNumberMinValidator(1)]],
      expMin:         [null],
      expMax:         [null],
      salaryType:     ['Monthly'],
      salaryCurrency: ['GBP'],
      salaryMin:      [null, [Validators.min(0)]],
      salaryMax:      [null, [Validators.min(0)]],
      salaryHidden:   [false],
      isRemote:       [false],
      countryId:      [null],
      division1Id:    [null],
      division2Id:    [null],
      cityId:         [null],
      pincode:        [''],
      fullAddress:    [''],
      // Visibility scope. Deliberately no cross-page default logic beyond
      // the literal default here — reset()'s create-mode default (below)
      // re-applies this same 'COUNTRY' value, matching the DB column default.
      visibilityType: ['COUNTRY', Validators.required],
      shiftType:      ['Day'],
      visaSponsorship: ['Not Specified'],
      referralAvailable: [false],
      applicationDeadline: [''],
      workStartTime:  [''],
      workEndTime:    [''],
      workingDays:    [[]],
      contactPerson:  [''],
      contactDialCode:[''],
      contactPhone:   [''],
      contactEmail:   ['', [Validators.email]],
      applicationUrl: ['', urlValidator],
      skills:         [[]],
      description:    ['', Validators.required],
      responsibilities: [''],
      qualifications:   [''],
      requirements:     [''],
      benefits:         [''],
    }, {
      validators: [salaryRangeValidator, expRangeValidator],
    });

    this.subscribeToSalaryHidden();
    this.subscribeToSalaryNegotiable();
    this.subscribeToWorkMode();
  }

  /**
   * Keeps `isRemote` in sync with `workMode` — the two used to be
   * independently editable (a separate "Fully Remote" toggle) and could
   * drift apart, which was confirmed against real data as the cause of
   * On-site jobs wrongly displaying "Remote". `workMode` is now the only
   * thing the user sets; `isRemote` is purely a derived value still sent
   * in the payload for backward compatibility with the `is_remote` column.
   *
   * Also clears the physical-location fields when switching to Remote, so
   * a stale on-site address can't linger if the user flips back and forth
   * before saving. Country is deliberately left alone — it drives the
   * separate applicant-country eligibility restriction ("Germany
   * applicants only"), independent of Work Mode.
   */
  private subscribeToWorkMode(): void {
    this.jobForm.get('workMode')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((mode: string) => {
        this.jobForm.get('isRemote')?.setValue(mode === 'Remote', { emitEvent: false });
        if (mode === 'Remote') {
          this.jobForm.get('division1Id')?.setValue(null, { emitEvent: false });
          this.jobForm.get('division2Id')?.setValue(null, { emitEvent: false });
          this.jobForm.get('cityId')?.setValue(null, { emitEvent: false });
          this.jobForm.get('pincode')?.setValue('', { emitEvent: false });
          this.jobForm.get('fullAddress')?.setValue('', { emitEvent: false });
        }
        // division1Id/division2Id/pincode can carry a Validators.required
        // from the selected country's own config (applyDivisionValidators/
        // applyPincodeValidators) — that's independent of Work Mode, so
        // switching to Remote (which hides those fields) has to re-run
        // both here or a hidden, now-empty field would keep the form stuck
        // invalid; switching back to On-site/Hybrid re-applies them.
        this.applyDivisionValidators();
        this.applyPincodeValidators();
      });
  }

  /** Hides & clears the amount fields while salary is hidden entirely. */
  private subscribeToSalaryHidden(): void {
    this.jobForm.get('salaryHidden')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((hidden: boolean) => {
        if (hidden) this.clearSalaryAmountFields();
      });
  }

  /** Negotiable has no fixed figure — clears (but doesn't require re-picking
   * currency) the min/max amount fields when it's selected. */
  private subscribeToSalaryNegotiable(): void {
    this.jobForm.get('salaryType')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((type: string) => {
        if (type === 'Negotiable') {
          this.jobForm.get('salaryMin')?.setValue(null, { emitEvent: false });
          this.jobForm.get('salaryMax')?.setValue(null, { emitEvent: false });
        }
      });
  }

  private clearSalaryAmountFields(): void {
    ['salaryType', 'salaryCurrency', 'salaryMin', 'salaryMax'].forEach(f => {
      this.jobForm.get(f)?.setValue(null);
      this.jobForm.get(f)?.clearValidators();
      this.jobForm.get(f)?.updateValueAndValidity({ emitEvent: false });
    });
  }

  // ── Working days ──
  isWorkingDay(day: string): boolean {
    return ((this.jobForm.get('workingDays')?.value as string[]) ?? []).includes(day);
  }

  toggleWorkingDay(day: string): void {
    const current: string[] = this.jobForm.get('workingDays')?.value ?? [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    this.jobForm.get('workingDays')?.setValue(next);
  }

  // ── Logo / images ──
  onLogoChange(files: File[]): void {
    const file = files[0] ?? null;
    this.selectedLogo.set(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = e => this.logoPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    } else { this.logoPreview.set(null); }
  }

  clearLogo(): void {
    this.selectedLogo.set(null);
    this.logoPreview.set(null);
    this.logoUploadReset.update(v => v + 1);
  }

  onJobImagesChange(files: File[]): void { this.selectedImages.set(files); }

  // ── Phone countries ──
  private loadPhoneCountriesIfNeeded(): void {
    if (this.phoneCountriesLoaded) return;
    this.phoneCountriesLoaded = true;
    this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.phoneCountries.set(data),
      error: () => {},
    });
  }

  private loadGeoCountriesIfNeeded(): void {
    if (this.geoCountriesLoaded) return;
    this.geoCountriesLoaded = true;
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.geoCountries.set(data),
      error: () => {},
    });
  }

  // ── Location cascade ──
  private getLeafDivisionId(): number | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) { const v = this.jobForm.get('division2Id')?.value; return v ? Number(v) : null; }
    if (levels === 1) { const v = this.jobForm.get('division1Id')?.value; return v ? Number(v) : null; }
    return null;
  }

  private getLeafDivisionName(): string | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) return this.selectedDivision2Name();
    if (levels === 1) return this.selectedDivision1Name();
    return null;
  }

  /** Division/pincode required-ness comes from the selected country's own
   * config — but a Remote job hides these fields entirely (see the
   * Location section), so they must never be required while Remote,
   * regardless of what the country would otherwise demand. */
  private applyDivisionValidators(): void {
    const levels = this.adminLevels().length;
    const remote = this.isRemoteCtrl;
    const d1 = this.jobForm.get('division1Id');
    const d2 = this.jobForm.get('division2Id');
    d1?.setValidators(!remote && levels >= 1 ? [Validators.required] : []);
    d2?.setValidators(!remote && levels >= 2 ? [Validators.required] : []);
    d1?.updateValueAndValidity({ emitEvent: false });
    d2?.updateValueAndValidity({ emitEvent: false });
  }

  // Optional in every country and every Work Mode — matches the Business
  // module's Postal Code field — only the country's format check applies
  // when a value is actually entered.
  private applyPincodeValidators(): void {
    const postal = this.countryConfig()?.postalCode;
    const ctrl = this.jobForm.get('pincode');
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
    this.jobForm.get('division1Id')?.setValue(null, silent);
    this.jobForm.get('division2Id')?.setValue(null, silent);
    this.jobForm.get('cityId')?.setValue(null, silent);
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
      error: () => this.toast.error('user.jobs.toast.failedLoadCountryAddressDetails'),
    });
  }

  onDivision1Change(divisionId: any): void {
    this.jobForm.get('division2Id')?.setValue(null);
    this.jobForm.get('cityId')?.setValue(null);
    this.division2Options.set([]);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);

    const id = divisionId ? Number(divisionId) : null;
    this.selectedDivision1Name.set(id ? (this.division1Options().find(d => d.id === id)?.name ?? null) : null);

    const countryId = this.jobForm.get('countryId')?.value ? Number(this.jobForm.get('countryId')?.value) : null;
    if (id && countryId && this.adminLevels().length >= 2) {
      this.division2Loading.set(true);
      this.geographyService.getDivisions(countryId, id).pipe(takeUntil(this.destroy$)).subscribe({
        next: divisions => { this.division2Options.set(divisions); this.division2Loading.set(false); },
        error: () => this.division2Loading.set(false),
      });
    }
  }

  onDivision2Change(divisionId: any): void {
    this.jobForm.get('cityId')?.setValue(null);
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

  /**
   * Best-effort edit-mode resurrection. Prefers the stored countryId/cityId
   * (now that the backend persists them); falls back to matching the plain
   * city/state/country strings by name for jobs created before those id
   * columns existed, same graceful degradation the business form uses.
   */
  private resurrectJobLocation(job: Job): void {
    const silent = { emitEvent: false, emitViewToModelChange: false };
    this.resetDivisionState();

    const country = job.countryId != null
      ? this.geoCountries().find(c => c.id === job.countryId)
      : (job.country ? this.geoCountries().find(c => c.name.toLowerCase() === job.country!.toLowerCase()) : null);
    if (!country) { this.selectedRegionCountryId.set(null); this.applyDivisionValidators(); this.applyPincodeValidators(); return; }

    this.selectedRegionCountryId.set(country.id);
    this.jobForm.get('countryId')?.setValue(country.id, silent);
    this.geographyService.getCountryConfig(country.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        this.applyDivisionValidators();
        this.applyPincodeValidators();
        if (config.divisionLevels.length === 0 || !job.state) return;

        this.division1Loading.set(true);
        this.geographyService.getDivisions(country.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: (divisions) => {
            this.division1Options.set(divisions);
            this.division1Loading.set(false);
            const match = job.stateId != null
              ? divisions.find(d => d.id === job.stateId)
              : divisions.find(d => d.name.toLowerCase() === job.state!.toLowerCase());
            if (!match) return;
            this.jobForm.get('division1Id')?.setValue(match.id, silent);
            this.selectedDivision1Name.set(match.name);
            if (job.city) this.resurrectJobCity(match.id, job.city, job.cityId);
          },
          error: () => this.division1Loading.set(false),
        });
      },
      error: () => {},
    });
  }

  private resurrectJobCity(divisionId: number, cityName: string, cityId?: number): void {
    this.geographyService.searchCities({ divisionId, countryId: undefined, search: cityName, page: 1, limit: 20 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const match = cityId != null
            ? res.data.find(c => c.id === cityId)
            : (cityName ? res.data.find(c => c.name.toLowerCase() === cityName.toLowerCase()) : null);
          if (!match) return;
          const silent = { emitEvent: false, emitViewToModelChange: false };
          this.jobForm.get('cityId')?.setValue(match.id, silent);
          this.selectedCityName.set(match.name);
          this.selectedCityOption.set({ value: match.id, label: match.name });
          this.cityNameCache.set(match.id, match.name);
        },
        error: () => {},
      });
  }

  // ── Phone validation ──
  getPhoneError(): string | null {
    const dialCode = this.jobForm.get('contactDialCode')?.value ?? '';
    const phone    = this.jobForm.get('contactPhone')?.value ?? '';
    if (!phone) return null;
    if (!dialCode) return this.translate.instant('jobs.value.selectDialCodeFirst');
    const rule = getPhoneRule(dialCode);
    if (rule.pattern && !rule.pattern.test(phone)) return rule.hint;
    return null;
  }

  // ── Create / Edit ──
  private resetForCreate(): void {
    this.editingJob.set(null);
    this.jobSubmitAttempted.set(false);
    this.jobForm.reset({
      // jobType intentionally left unset (reset()'s default of null) — no
      // pre-selected Employment Type; the placeholder shows until chosen.
      workMode: 'On-site', salaryType: 'Monthly',
      salaryCurrency: 'GBP', shiftType: 'Day', openings: 1,
      isRemote: false, salaryHidden: false, workingDays: [], skills: [],
      visibilityType: 'COUNTRY',
      visaSponsorship: 'Not Specified', referralAvailable: false,
    });
    this.resetDivisionState();
    this.selectedRegionCountryId.set(null);
    this.applyDivisionValidators();
    this.applyPincodeValidators();
    this.selectedImages.set([]);
    this.selectedLogo.set(null);
    this.logoPreview.set(null);
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);
  }

  private loadForEdit(id: string): void {
    this.jobService.getJob(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (job) => this.applyEditFormData(job),
      error: () => { this.toast.error('user.jobs.toast.failedLoadJobs'); this.closed.emit(); },
    });
  }

  private applyEditFormData(job: Job): void {
    this.editingJob.set(job);
    this.jobSubmitAttempted.set(false);
    this.selectedImages.set([]);
    this.selectedLogo.set(null);
    this.logoPreview.set(job.companyLogo ?? null);

    this.jobForm.patchValue({
      companyName:     job.companyName    ?? '',
      companyWebsite:  job.companyWebsite ?? '',
      title:           job.title,
      jobType:         job.jobType        ?? null,
      workMode:        job.workMode       ?? 'On-site',
      education:       job.education      ?? '',
      openings:        job.openings       ?? 1,
      expMin:          job.expMin         ?? null,
      expMax:          job.expMax         ?? null,
      salaryType:      job.salaryType     ?? 'Monthly',
      salaryCurrency:  job.salaryCurrency ?? 'GBP',
      salaryMin:       job.salaryMin      ?? null,
      salaryMax:       job.salaryMax      ?? null,
      salaryHidden:    job.salaryHidden   ?? false,
      // Derived from workMode rather than trusted from job.isRemote — a
      // legacy job saved before the two were kept in sync could still have
      // a stale isRemote value that disagrees with its own workMode.
      isRemote:        (job.workMode ?? 'On-site') === 'Remote',
      pincode:         job.pincode        ?? '',
      fullAddress:     job.fullAddress    ?? '',
      visibilityType:  job.visibilityType ?? 'COUNTRY',
      shiftType:       job.shiftType      ?? 'Day',
      visaSponsorship: job.visaSponsorship ?? 'Not Specified',
      referralAvailable: job.referralAvailable ?? false,
      applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 10) : '',
      workStartTime:   job.workStartTime  ?? '',
      workEndTime:     job.workEndTime    ?? '',
      workingDays:     job.workingDays    ?? [],
      contactPerson:   job.contactPerson  ?? '',
      // contactPhone is patched below by resurrectPhoneFields(), once
      // phoneCountries() is guaranteed loaded — it needs to split the
      // stored "<dial_code><digits>" string back into contactDialCode +
      // bare digits, or contactDialCode is left blank and the "select a
      // dial code" error wrongly fires the moment the field is touched.
      contactEmail:    job.contactEmail   ?? '',
      applicationUrl:  job.applicationUrl ?? '',
      skills:          job.skills         ?? [],
      description:     job.description    ?? '',
      responsibilities: job.responsibilities ?? '',
      qualifications:   job.qualifications   ?? '',
      requirements:     job.requirements     ?? '',
      benefits:         job.benefits         ?? '',
    });
    this.resurrectJobLocation(job);
    this.resurrectPhoneField(job.contactPhone);
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);
  }

  /**
   * Splits a stored "<dial_code><digits>" value (or legacy bare-digits)
   * back into contactDialCode + clean local digits, mirroring
   * business-form-modal's splitPhoneValue()/applyPhoneFields(). Without
   * this, contactPhone patched the raw combined string while
   * contactDialCode stayed blank — a real (not just cosmetic) mismatch
   * that made "Please select a dial code first" fire the moment the phone
   * field was touched, even though the phone number itself was already
   * saved with its dial code.
   */
  private resurrectPhoneField(storedPhone: string | undefined | null): void {
    const apply = () => {
      const { dialCode, digits } = this.splitPhoneValue(storedPhone);
      this.jobForm.patchValue({ contactDialCode: dialCode, contactPhone: digits });
    };
    if (this.phoneCountries().length > 0) {
      apply();
    } else {
      this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => { this.phoneCountries.set(data); apply(); },
        error: () => apply(),
      });
    }
  }

  private splitPhoneValue(value: string | undefined | null): { dialCode: string; digits: string } {
    const raw = (value ?? '').trim();
    if (!raw) return { dialCode: '', digits: '' };
    const withoutPlus = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
    const countries = [...this.phoneCountries()].sort((a, b) => b.dial_code.length - a.dial_code.length);
    for (const c of countries) {
      const dial = c.dial_code.replace(/\D/g, '');
      if (dial && withoutPlus.startsWith(dial)) {
        return { dialCode: c.dial_code, digits: withoutPlus.slice(dial.length) };
      }
    }
    return { dialCode: '', digits: withoutPlus };
  }

  /** Reused as-is from business-form-modal's identical pattern — the one
   * shared "You have unsaved changes" dialog, driven by UnsavedChangesService. */
  isDirty(): boolean {
    return this.open && this.jobForm.dirty;
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

  submitJob(): void {
    this.jobSubmitAttempted.set(true);
    this.jobForm.markAllAsTouched();
    if (this.jobForm.invalid) return;

    this.submitting.set(true);
    const raw     = this.jobForm.value;
    const editing = this.editingJob();
    const data    = editing ? this.buildEditPayload(raw, editing) : this.buildJobPayload(raw);
    const images  = this.selectedImages();
    const logo    = this.selectedLogo();

    const req = editing
      ? this.jobService.updateJob(editing.id, data, images.length > 0 ? images : undefined, logo ?? undefined)
      : this.jobService.createJob(data, images.length > 0 ? images : undefined, logo ?? undefined);

    req.subscribe({
      next: (job) => {
        if (job.status === 'PENDING') {
          this.toast.success(editing ? 'user.jobs.toast.jobResubmittedAdminApproval' : 'user.jobs.toast.jobSubmittedAdminApproval');
        } else {
          this.toast.success(editing ? 'user.jobs.toast.jobUpdatedSuccessfully' : 'user.jobs.toast.jobPostedSuccessfully');
        }
        this.submitting.set(false);
        this.saved.emit(job);
        this.closed.emit();
      },
      error: () => {
        this.toast.error(editing ? 'user.jobs.toast.failedUpdateJobPleaseTry' : 'user.jobs.toast.failedPostJobPleaseTry');
        this.submitting.set(false);
      },
    });
  }

  /**
   * Builds the create payload. Unlike the page this replaced, `countryId`/
   * `stateId`/`cityId` are kept (not stripped) — the backend now persists
   * them, which is what makes country-based visibility possible — the
   * resolved display-name strings are set alongside for backward-compat,
   * mirroring `business-form-modal.component.ts`'s `submitBusiness()`.
   */
  private buildJobPayload(raw: Record<string, any>): Record<string, any> {
    const country = this.geoCountries().find(c => c.id === raw['countryId']);
    const leafDivisionId = this.getLeafDivisionId();
    const leafDivisionName = this.getLeafDivisionName();
    const cityName = this.selectedCityName();
    const phone = (raw['contactDialCode'] && raw['contactPhone'])
      ? `${raw['contactDialCode']}${raw['contactPhone']}`
      : (raw['contactPhone'] ?? '');

    const payload: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (['division1Id', 'division2Id', 'contactDialCode'].includes(key)) continue;
      if (val === null || val === undefined || val === '') continue;
      if (Array.isArray(val) && val.length === 0) continue;
      payload[key] = val;
    }
    payload['stateId'] = leafDivisionId ?? undefined;
    if (country)          payload['country'] = country.name;
    if (leafDivisionName) payload['state']   = leafDivisionName;
    if (cityName)         payload['city']    = cityName;
    if (phone)            payload['contactPhone'] = phone;
    return payload;
  }

  /** Same as buildJobPayload but also keeps fields that haven't changed (null-safe for edits) */
  private buildEditPayload(raw: Record<string, any>, original: Job): Record<string, any> {
    const payload = this.buildJobPayload(raw);
    if (payload['stateId'] === undefined && original.stateId != null) payload['stateId'] = original.stateId;
    if (!payload['country'] && original.country) payload['country'] = original.country;
    if (!payload['state']   && original.state)   payload['state']   = original.state;
    if (!payload['city']    && original.city)     payload['city']    = original.city;
    return payload;
  }
}
