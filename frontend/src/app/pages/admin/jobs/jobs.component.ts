import {
  Component, OnInit, OnDestroy, HostListener, inject, signal, computed
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  ReactiveFormsModule, FormsModule, FormBuilder, FormGroup,
  Validators, AbstractControl, ValidationErrors, ValidatorFn
} from '@angular/forms';
import { Subject, takeUntil, Observable, map } from 'rxjs';
import { JobService, JobsQueryParams } from '../../../core/services/job.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService, MasterState, MasterCity } from '../../../core/services/master-data.service';
import { GeographyService } from '../../../core/services/geography.service';
import { Country, Job, PaginatedResponse, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { TagInputComponent } from '../../../shared/components/tag-input/tag-input.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { getCurrencySymbol, getCurrencySelectOptions } from '../../../shared/constants/currencies';
import { getPhoneRule } from '../../../shared/utils/phone';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';

export interface FilterChip { key: string; label: string; value: any; }

const VIEW_STORAGE_KEY = 'admin-jobs:viewMode';

/**
 * How long a Save/Delete popup stays open (with its submit button disabled
 * and showing its spinner) after a successful action, before auto-closing —
 * long enough for the success toast to be clearly visible above the popup
 * rather than the popup vanishing the instant the toast appears.
 */
const CONFIRM_CLOSE_DELAY_MS = 900;

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

/** Country-aware postal code validator — see business-form-modal.component.ts for the fuller explanation. */
function postalCodeValidator(regex: string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v || !regex) return null;
    try { return new RegExp(regex).test(v) ? null : { postalFormat: true }; }
    catch { return null; }
  };
}

@Component({
  selector: 'app-admin-jobs',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, DatePipe,
    SearchableSelectComponent, FileUploadComponent, TagInputComponent, ImageErrorHandlerDirective, ImageUrlPipe, ImageViewerComponent,
    SortBarComponent,
  ],
  templateUrl: './jobs.component.html',
  styleUrls: ['./jobs.component.scss'],
})
export class AdminJobsComponent implements OnInit, OnDestroy {
  private jobService        = inject(JobService);
  private toast             = inject(ToastService);
  private masterDataService = inject(MasterDataService);
  private geographyService  = inject(GeographyService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  // ─── Data ───────────────────────────────────────────────────
  jobs          = signal<Job[]>([]);
  loading       = signal(true);
  submitting    = signal(false);
  skeletonItems = Array(5);

  // ─── Pagination ─────────────────────────────────────────────
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  // ─── Search & Filter ────────────────────────────────────────
  searchQuery   = signal('');
  activeJobType = signal<string>('');    // kept for backward compat
  private debounceTimer: any  = null;
  private filterDebounce: any = null;

  // Filter signals (mirror user component)
  filterJobType       = signal('');
  filterWorkMode      = signal('');
  filterCountry       = signal('');
  filterState         = signal('');
  filterCity          = signal('');
  showAdvancedFilters = signal(false);
  filterExpMin        = signal<number | null>(null);
  filterExpMax        = signal<number | null>(null);
  filterSalaryMin     = signal<number | null>(null);
  filterSalaryMax     = signal<number | null>(null);
  filterShiftType     = signal('');
  filterEducation     = signal('');
  filterCompanyName   = signal('');
  filterSalaryHidden  = signal<boolean | null>(null);
  filterPostedWithin  = signal<number | null>(null);
  filterStatus        = signal<'active' | 'inactive' | ''>('');
  filterDateFrom      = signal('');
  filterDateTo        = signal('');
  sortBy              = signal<string>('newest');

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

  // ── Sort — column-click-sort equivalent, shared by the sort-bar (List
  // view, date/salary only) and every sortable Table-view column header.
  // Jobs' backend sort is a single combined enum (newest/oldest/salary_high/
  // salary_low/company_az/title_az/…), so the generic {field, dir} used by
  // the UI is translated to/from that enum here in one place.
  //
  // Table columns cycle through THREE states per click — ascending →
  // descending → normal (no icon, default sort) — rather than just
  // toggling asc/desc forever, so a column can be explicitly "un-sorted"
  // again. `activeSortField`/`activeSortDir` track this UI-level state
  // directly instead of being derived from the raw `sortBy` enum value,
  // because the "normal" state and "Date, descending" both map to the same
  // backend value ('newest' is the default sort) — deriving purely from
  // the enum couldn't tell those two apart.
  readonly sortFields: SortField[] = [
    { key: 'date',   label: 'Date' },
    { key: 'salary', label: 'Salary' },
  ];

  private readonly sortFieldMap: Record<string, { asc: string; desc: string }> = {
    date:     { asc: 'oldest',          desc: 'newest' },
    salary:   { asc: 'salary_low',      desc: 'salary_high' },
    title:    { asc: 'title_az',        desc: 'title_za' },
    location: { asc: 'location_az',     desc: 'location_za' },
    type:     { asc: 'type_az',         desc: 'type_za' },
    status:   { asc: 'status_inactive', desc: 'status_active' },
  };

  activeSortField = signal<string | null>(null);
  activeSortDir   = signal<SortDir>('asc');

  sortBarField = computed<string>(() => this.activeSortField() ?? '');
  sortBarDir   = computed<SortDir>(() => this.activeSortDir());

  private applyActiveSort(): void {
    const field = this.activeSortField();
    const map = field ? this.sortFieldMap[field] : null;
    this.sortBy.set(map ? (this.activeSortDir() === 'asc' ? map.asc : map.desc) : 'newest');
    this.loadJobs(1);
  }

  /** Sort-bar widget (List view) — its own 2-state asc/desc toggle. */
  onSortBarChange(change: SortChange): void {
    this.activeSortField.set(change.sortBy);
    this.activeSortDir.set(change.sortDir);
    this.applyActiveSort();
  }

  /** Table-view column header click — 3-click cycle: ascending → descending → normal. */
  toggleColumnSort(field: string): void {
    if (this.activeSortField() !== field) {
      this.activeSortField.set(field);
      this.activeSortDir.set('asc');
    } else if (this.activeSortDir() === 'asc') {
      this.activeSortDir.set('desc');
    } else {
      this.activeSortField.set(null);
    }
    this.applyActiveSort();
  }

  // Filter location cascade
  filterStates  = signal<MasterState[]>([]);
  filterCities  = signal<MasterCity[]>([]);
  filterStatesLoading = signal(false);
  filterCitiesLoading = signal(false);

  filterStateOptions = computed<SelectOption[]>(() =>
    this.filterStates().map(s => ({ value: s.name, label: s.name }))
  );
  filterCityOptions = computed<SelectOption[]>(() =>
    this.filterCities().map(c => ({ value: c.name, label: c.name }))
  );

  // Active filter chips
  activeFilterChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    const add = (key: string, label: string, value: any) => chips.push({ key, label, value });
    if (this.searchQuery())           add('search',       `"${this.searchQuery()}"`, this.searchQuery());
    if (this.filterJobType())         add('jobType',      this.filterJobType(), this.filterJobType());
    if (this.filterWorkMode())        add('workMode',     this.filterWorkMode(), this.filterWorkMode());
    if (this.filterCountry())         add('country',      this.filterCountry(), this.filterCountry());
    if (this.filterState())           add('state',        this.filterState(), this.filterState());
    if (this.filterCity())            add('city',         this.filterCity(), this.filterCity());
    if (this.filterCompanyName())     add('companyName',  this.filterCompanyName(), this.filterCompanyName());
    if (this.filterShiftType())       add('shiftType',    this.filterShiftType(), this.filterShiftType());
    if (this.filterEducation())       add('education',    this.filterEducation(), this.filterEducation());
    if (this.filterExpMin() != null)  add('expMin',       `Min ${this.filterExpMin()} yr`, this.filterExpMin());
    if (this.filterExpMax() != null)  add('expMax',       `Max ${this.filterExpMax()} yr`, this.filterExpMax());
    if (this.filterSalaryMin() != null) add('salaryMin',  `Salary ≥ ${this.filterSalaryMin()}`, this.filterSalaryMin());
    if (this.filterSalaryMax() != null) add('salaryMax',  `Salary ≤ ${this.filterSalaryMax()}`, this.filterSalaryMax());
    if (this.filterSalaryHidden() === true)  add('salaryHidden', 'Not Disclosed', true);
    if (this.filterPostedWithin() != null) {
      const labels: Record<number, string> = { 1: 'Today', 7: 'Last 7 days', 30: 'Last 30 days' };
      add('postedWithin', labels[this.filterPostedWithin()!] ?? `Last ${this.filterPostedWithin()} days`, this.filterPostedWithin());
    }
    if (this.filterStatus())   add('status',   this.filterStatus() === 'active' ? 'Active' : 'Inactive', this.filterStatus());
    if (this.filterDateFrom()) add('dateFrom', `From ${this.filterDateFrom()}`, this.filterDateFrom());
    if (this.filterDateTo())   add('dateTo',   `To ${this.filterDateTo()}`, this.filterDateTo());
    return chips;
  });

  activeFilterCount = computed(() => this.activeFilterChips().length);

  // ─── Accordion ───────────────────────────────────────────────
  activeJobId = signal<string | null>(null);
  // Show-more/less for job description sub-fields — keyed by `${jobId}:${field}`
  // so Description/Responsibilities/Qualifications/Requirements/Benefits each
  // expand independently.
  expandedTextFields = signal<Set<string>>(new Set());

  // ─── Image Viewer ────────────────────────────────────────────
  imageViewerOpen = signal(false);
  imageViewerImages = signal<string[]>([]);
  imageViewerInitialIndex = signal(0);

  isFieldExpanded(jobId: string, field: string): boolean { return this.expandedTextFields().has(`${jobId}:${field}`); }
  toggleTextField(jobId: string, field: string, event: Event): void {
    event.stopPropagation();
    const key = `${jobId}:${field}`;
    this.expandedTextFields.update(s => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }
  isTextLong(text: string | null | undefined): boolean { return (text?.length ?? 0) > 400; }
  getShortText(text: string): string { return text.substring(0, 400) + '…'; }

  // ─── Image Viewer ────────────────────────────────────────────
  openImageViewer(images: string[], index: number = 0, event: Event): void {
    event.stopPropagation();
    this.imageViewerImages.set(images);
    this.imageViewerInitialIndex.set(index);
    this.imageViewerOpen.set(true);
  }

  closeImageViewer(): void {
    this.imageViewerOpen.set(false);
  }

  // ─── Modal ───────────────────────────────────────────────────
  showAddModal    = signal(false);
  selectedImages  = signal<File[]>([]);
  selectedLogo    = signal<File | null>(null);
  logoPreview     = signal<string | null>(null);
  jobForm!: FormGroup;
  fileUploadReset = signal(0);
  logoUploadReset = signal(0);

  // ─── Edit mode ───────────────────────────────────────────────
  editingJob     = signal<Job | null>(null);
  editSubmitting = signal(false);

  // ─── Delete confirmation modal (for accordion body action) ───
  showDeleteConfirm = signal(false);
  jobToDelete       = signal<Job | null>(null);
  deleting          = signal(false);

  // ─── List / Table view toggle ────────────────────────────────
  viewMode = signal<'list' | 'table'>('list');

  setViewMode(mode: 'list' | 'table'): void {
    this.viewMode.set(mode);
    sessionStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  // ─── Table-row detail popup ──────────────────────────────────
  detailJob = signal<Job | null>(null);

  openDetail(job: Job): void { this.detailJob.set(job); }
  closeDetail(): void { this.detailJob.set(null); }

  editFromDetail(job: Job, event: Event): void {
    this.closeDetail();
    this.openEditModal(job, event);
  }

  deleteFromDetail(job: Job, event: Event): void {
    // Keep the detail popup open underneath — the delete confirmation
    // stacks on top of it (see .jb-delete-modal-backdrop / .jb-delete-modal
    // z-index in the stylesheet) rather than replacing it, so cancelling
    // returns the admin to exactly where they were.
    this.openDeleteConfirm(job, event);
  }

  // ─── Floating header action (shows once scrolled past the page header) ───
  showHeaderFab = signal(false);
  private scrollTicking = false;

  // Admin always has permission — helper kept for HTML symmetry
  canEditJob(_job: Job): boolean { return true; }

  // ─── Master data (dial-code picker only — location section below uses
  // GeographyService instead) ─────────────────────────────────────
  countries      = signal<Country[]>([]);
  countryOptions = computed<SelectOption[]>(() =>
    this.countries().map(c => ({ value: c.id, label: `${c.flag_emoji} ${c.name}` }))
  );
  dialCodeOptions = computed<SelectOption[]>(() =>
    this.countries().map(c => ({ value: c.dial_code, label: `${c.flag_emoji} ${c.dial_code}` }))
  );

  // ─── Location — Country → Division(s) → City → Postal cascade ──────
  // Mirrors business-form-modal.component.ts's implementation; Jobs has no
  // stored location ids (only plain city/state/country strings), so on
  // submit the leaf division/city NAME is resolved and written into those
  // string columns exactly as Business does for its own legacy fields.
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

  // ─── Static Options ─────────────────────────────────────────
  readonly jobTypes    = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
  readonly jobTypeOptions: SelectOption[] = this.jobTypes.map(t => ({ value: t, label: t }));
  readonly workModes   = ['Remote', 'Hybrid', 'On-site'] as const;
  readonly shiftTypes  = ['Day', 'Night', 'Rotational', 'Flexible'] as const;
  readonly salaryTypes = ['Fixed', 'Hourly', 'Monthly', 'Annual'] as const;
  readonly workDays    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly currencyOptions: SelectOption[] = getCurrencySelectOptions();

  readonly educationOptions: SelectOption[] = [
    { value: 'None',       label: 'No education needed' },
    { value: '8th',        label: '8th'                  },
    { value: '10th',       label: '10th'                 },
    { value: '12th',       label: '12th'                 },
    { value: 'Diploma',    label: 'Diploma'              },
    { value: 'ITI',        label: 'ITI'                  },
    { value: 'Any',        label: 'Any Graduate'         },
    { value: "Bachelor's", label: "Bachelor's Degree"    },
    { value: "Master's",   label: "Master's Degree"      },
    { value: 'PhD',        label: 'PhD'                  },
  ];

  readonly expOptions: SelectOption[] = [
    { value: 0,  label: 'Fresher (0 yrs)' },
    { value: 1,  label: '1 Year'          },
    { value: 2,  label: '2 Years'         },
    { value: 3,  label: '3 Years'         },
    { value: 4,  label: '4 Years'         },
    { value: 5,  label: '5 Years'         },
    { value: 7,  label: '7 Years'         },
    { value: 10, label: '10 Years'        },
    { value: 15, label: '15+ Years'       },
  ];

  readonly sortOptions: SelectOption[] = [
    { value: 'newest',      label: 'Newest First'   },
    { value: 'oldest',      label: 'Oldest First'   },
    { value: 'salary_high', label: 'Highest Salary' },
    { value: 'salary_low',  label: 'Lowest Salary'  },
    { value: 'company_az',  label: 'Company (A→Z)'  },
  ];

  readonly postedWithinOptions: SelectOption[] = [
    { value: 1,  label: 'Today'        },
    { value: 7,  label: 'Last 7 Days'  },
    { value: 30, label: 'Last 30 Days' },
  ];

  readonly filterExpOptions: SelectOption[] = [
    { value: 0,  label: 'Fresher' }, { value: 1,  label: '1 yr'   },
    { value: 2,  label: '2 yrs'  }, { value: 3,  label: '3 yrs'  },
    { value: 5,  label: '5 yrs'  }, { value: 7,  label: '7 yrs'  },
    { value: 10, label: '10 yrs' }, { value: 15, label: '15+ yrs'},
  ];

  // ─── Stats ──────────────────────────────────────────────────
  jobTypeCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const job of this.jobs()) {
      const type = job.jobType ?? 'Other';
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  });

  // ─── Lifecycle ───────────────────────────────────────────────
  ngOnInit(): void {
    this.initForm();
    this.restoreSavedViewMode();
    this.loadJobs(1);
    this.loadCountries();
    this.loadGeoCountries();
    this.subscribeToSalaryHidden();
  }

  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'list' || saved === 'table') this.viewMode.set(saved);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
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

  private loadCountries(): void {
    this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.countries.set(data),
      error: () => {},
    });
  }

  private subscribeToSalaryHidden(): void {
    this.jobForm.get('salaryHidden')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((hidden: boolean) => {
        if (hidden) {
          ['salaryType', 'salaryCurrency', 'salaryMin', 'salaryMax'].forEach(f => {
            this.jobForm.get(f)?.setValue(null);
            this.jobForm.get(f)?.clearValidators();
            this.jobForm.get(f)?.updateValueAndValidity({ emitEvent: false });
          });
        }
      });
  }

  // ─── Location cascade ────────────────────────────────────────
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

  private applyDivisionValidators(): void {
    const levels = this.adminLevels().length;
    const d1 = this.jobForm.get('division1Id');
    const d2 = this.jobForm.get('division2Id');
    d1?.setValidators(levels >= 1 ? [Validators.required] : []);
    d2?.setValidators(levels >= 2 ? [Validators.required] : []);
    d1?.updateValueAndValidity({ emitEvent: false });
    d2?.updateValueAndValidity({ emitEvent: false });
  }

  private applyPincodeValidators(): void {
    const postal = this.countryConfig()?.postalCode;
    const validators: ValidatorFn[] = [postalCodeValidator(postal?.regex ?? null)];
    if (postal?.required) validators.push(Validators.required);
    const ctrl = this.jobForm.get('pincode');
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
    this.jobForm.get('division1Id')?.setValue(null, silent);
    this.jobForm.get('division2Id')?.setValue(null, silent);
    this.jobForm.get('cityId')?.setValue(null, silent);
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

  private loadGeoCountries(): void {
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.geoCountries.set(data),
      error: () => {},
    });
  }

  /**
   * Best-effort edit-mode resurrection: unlike Business, Jobs stores only
   * plain city/state/country strings (no ids), so the previously-picked
   * division/city can't be looked up directly — instead we fetch the
   * country's division list and match the stored name case-insensitively.
   * If no match is found (e.g. a 2-level country whose stored name was the
   * leaf/district rather than the top-level division) the field is simply
   * left blank for the admin to re-pick, same graceful fallback the page
   * already had before this rework.
   */
  private resurrectJobLocation(job: Job): void {
    const silent = { emitEvent: false, emitViewToModelChange: false };
    this.resetDivisionState();
    const country = job.country ? this.geoCountries().find(c => c.name.toLowerCase() === job.country!.toLowerCase()) : null;
    if (!country) { this.applyDivisionValidators(); this.applyPincodeValidators(); return; }

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
            const match = divisions.find(d => d.name.toLowerCase() === job.state!.toLowerCase());
            if (!match) return;
            this.jobForm.get('division1Id')?.setValue(match.id, silent);
            this.selectedDivision1Name.set(match.name);
            if (job.city) this.resurrectJobCity(match.id, job.city);
          },
          error: () => this.division1Loading.set(false),
        });
      },
      error: () => {},
    });
  }

  private resurrectJobCity(divisionId: number, cityName: string): void {
    this.geographyService.searchCities({ divisionId, countryId: undefined, search: cityName, page: 1, limit: 20 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const match = cityName ? res.data.find(c => c.name.toLowerCase() === cityName.toLowerCase()) : null;
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

  // ─── Data Loading ────────────────────────────────────────────
  loadJobs(page = 1): void {
    this.loading.set(true);
    this.currentPage.set(page);
    this.activeJobId.set(null);

    const query: JobsQueryParams = { page, limit: this.pageSize() };
    if (this.searchQuery().trim())    query.search      = this.searchQuery().trim();
    if (this.filterJobType())         query.jobType     = this.filterJobType();
    if (this.filterWorkMode())        query.workMode    = this.filterWorkMode();
    if (this.filterCountry())         query.country     = this.filterCountry();
    if (this.filterState())           query.state       = this.filterState();
    if (this.filterCity())            query.city        = this.filterCity();
    if (this.filterShiftType())       query.shiftType   = this.filterShiftType();
    if (this.filterEducation())       query.education   = this.filterEducation();
    if (this.filterExpMin() != null)  query.expMin      = this.filterExpMin()!;
    if (this.filterExpMax() != null)  query.expMax      = this.filterExpMax()!;
    if (this.filterSalaryMin() != null) query.salaryMin = this.filterSalaryMin()!;
    if (this.filterSalaryMax() != null) query.salaryMax = this.filterSalaryMax()!;
    if (this.filterSalaryHidden() != null) query.salaryHidden = this.filterSalaryHidden()!;
    if (this.filterPostedWithin() != null) query.postedWithin = this.filterPostedWithin()!;
    if (this.filterStatus())          query.status      = this.filterStatus() as 'active' | 'inactive';
    if (this.filterDateFrom())        query.dateFrom    = this.filterDateFrom();
    if (this.filterDateTo())          query.dateTo      = this.filterDateTo();
    if (this.sortBy() && this.sortBy() !== 'newest') query.sortBy = this.sortBy() as any;

    this.jobService.getJobs(query).subscribe({
      next: (response: PaginatedResponse<Job>) => {
        this.jobs.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load jobs'); this.loading.set(false); },
    });
  }

  // ─── Accordion ───────────────────────────────────────────────
  toggleAccordion(id: string, event?: Event): void {
    if (event) event.stopPropagation();
    const opening = this.activeJobId() !== id;
    this.activeJobId.update(cur => cur === id ? null : id);
    if (opening) {
      // Bring the newly-expanded card's top into view — scoped to this one
      // card element only (never document.body/document.documentElement),
      // so opening a card lower on a long list doesn't require the admin
      // to manually scroll to see its detail.
      setTimeout(() => this.scrollCardIntoView(id), 0);
    }
  }

  /**
   * Scrolls the given card to just below the app's sticky top header
   * (`.top-header`, see admin-layout.component.scss) instead of flush to
   * the very top of the viewport — plain `scrollIntoView({block:'start'})`
   * lands the card's top edge at y=0, which the sticky header then
   * overlaps, hiding the first ~64px of the card and reading as an
   * over-scroll to the page top.
   */
  private scrollCardIntoView(id: string): void {
    const cardEl = document.getElementById('job-card-' + id);
    if (!cardEl) return;
    const headerEl = document.querySelector('.top-header');
    const headerOffset = (headerEl?.getBoundingClientRect().height ?? 0) + 16;
    const cardTop = cardEl.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: cardTop - headerOffset, behavior: 'smooth' });
  }

  // ─── Search & Filter methods (mirror user component) ─────────
  private triggerFilteredLoad(): void {
    if (this.filterDebounce) clearTimeout(this.filterDebounce);
    this.filterDebounce = setTimeout(() => this.loadJobs(1), 350);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.loadJobs(1), 300);
  }

  clearSearch(): void { this.searchQuery.set(''); this.loadJobs(1); }

  setJobTypeFilter(type: string): void {
    this.filterJobType.set(this.filterJobType() === type ? '' : type);
    this.activeJobId.set(null);
    this.triggerFilteredLoad();
  }

  setWorkModeFilter(mode: string): void {
    this.filterWorkMode.set(this.filterWorkMode() === mode ? '' : mode);
    this.triggerFilteredLoad();
  }

  setSortBy(value: any): void {
    const v = value ?? 'newest';
    this.sortBy.set(v);
    // Keep the table-column/sort-bar active-state in sync with whichever
    // value the plain dropdown picked, so switching to Table view still
    // shows the right column as sorted (or none, for "Newest First").
    const found = Object.entries(this.sortFieldMap).find(([, map]) => map.asc === v || map.desc === v);
    if (found) {
      const [field, map] = found;
      this.activeSortField.set(field);
      this.activeSortDir.set(map.asc === v ? 'asc' : 'desc');
    } else {
      this.activeSortField.set(null);
    }
    this.loadJobs(1);
  }

  setAdvancedFilter(sig: any, value: any): void { sig.set(value ?? null); this.triggerFilteredLoad(); }

  setPostedWithin(days: number | null): void {
    this.filterPostedWithin.set(this.filterPostedWithin() === days ? null : days);
    this.triggerFilteredLoad();
  }

  setSalaryHiddenFilter(val: boolean | null): void {
    this.filterSalaryHidden.set(this.filterSalaryHidden() === val ? null : val);
    this.triggerFilteredLoad();
  }

  toggleAdvancedFilters(): void { this.showAdvancedFilters.update(v => !v); }

  onFilterCountryChange(countryName: any): void {
    this.filterCountry.set(countryName ?? '');
    this.filterState.set(''); this.filterCity.set('');
    this.filterStates.set([]); this.filterCities.set([]);
    if (countryName) {
      const country = this.countries().find(c => c.name === countryName);
      if (country) {
        this.filterStatesLoading.set(true);
        this.masterDataService.getStates(country.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({ next: s => { this.filterStates.set(s); this.filterStatesLoading.set(false); }, error: () => this.filterStatesLoading.set(false) });
      }
    }
    this.triggerFilteredLoad();
  }

  onFilterStateChange(stateName: any): void {
    this.filterState.set(stateName ?? ''); this.filterCity.set(''); this.filterCities.set([]);
    if (stateName) {
      const state = this.filterStates().find(s => s.name === stateName);
      if (state) {
        this.filterCitiesLoading.set(true);
        this.masterDataService.getCities(state.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({ next: c => { this.filterCities.set(c); this.filterCitiesLoading.set(false); }, error: () => this.filterCitiesLoading.set(false) });
      }
    }
    this.triggerFilteredLoad();
  }

  onFilterCityChange(cityName: any): void { this.filterCity.set(cityName ?? ''); this.triggerFilteredLoad(); }

  removeFilter(key: string): void {
    switch (key) {
      case 'search':       this.searchQuery.set('');         break;
      case 'jobType':      this.filterJobType.set('');       break;
      case 'workMode':     this.filterWorkMode.set('');      break;
      case 'country':      this.filterCountry.set(''); this.filterState.set(''); this.filterCity.set(''); this.filterStates.set([]); this.filterCities.set([]); break;
      case 'state':        this.filterState.set(''); this.filterCity.set(''); this.filterCities.set([]); break;
      case 'city':         this.filterCity.set('');          break;
      case 'companyName':  this.filterCompanyName.set('');   break;
      case 'shiftType':    this.filterShiftType.set('');     break;
      case 'education':    this.filterEducation.set('');     break;
      case 'expMin':       this.filterExpMin.set(null);      break;
      case 'expMax':       this.filterExpMax.set(null);      break;
      case 'salaryMin':    this.filterSalaryMin.set(null);   break;
      case 'salaryMax':    this.filterSalaryMax.set(null);   break;
      case 'salaryHidden': this.filterSalaryHidden.set(null); break;
      case 'postedWithin': this.filterPostedWithin.set(null); break;
      case 'status':       this.filterStatus.set('');        break;
      case 'dateFrom':     this.filterDateFrom.set('');      break;
      case 'dateTo':       this.filterDateTo.set('');        break;
    }
    this.loadJobs(1);
  }

  setStatusFilter(v: string | number): void {
    this.filterStatus.set(v as 'active' | 'inactive' | '');
    this.loadJobs(1);
  }

  onFilterDateFromChange(e: Event): void {
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
    this.loadJobs(1);
  }

  onFilterDateToChange(e: Event): void {
    this.filterDateTo.set((e.target as HTMLInputElement).value);
    this.loadJobs(1);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.loadJobs(1);
  }

  clearAllFilters(): void {
    this.searchQuery.set(''); this.filterJobType.set(''); this.filterWorkMode.set('');
    this.filterCountry.set(''); this.filterState.set(''); this.filterCity.set('');
    this.filterShiftType.set(''); this.filterEducation.set(''); this.filterCompanyName.set('');
    this.filterExpMin.set(null); this.filterExpMax.set(null);
    this.filterSalaryMin.set(null); this.filterSalaryMax.set(null);
    this.filterSalaryHidden.set(null); this.filterPostedWithin.set(null);
    this.filterStatus.set(''); this.filterDateFrom.set(''); this.filterDateTo.set('');
    this.filterStates.set([]); this.filterCities.set([]);
    this.sortBy.set('newest');
    this.activeSortField.set(null);
    this.loadJobs(1);
  }

  // filteredJobs (all jobs are already server-filtered)
  filteredJobs = computed(() => this.jobs());

  // ─── Working Days ────────────────────────────────────────────
  isWorkingDay(day: string): boolean {
    return ((this.jobForm.get('workingDays')?.value as string[]) ?? []).includes(day);
  }

  toggleWorkingDay(day: string): void {
    const current: string[] = this.jobForm.get('workingDays')?.value ?? [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    this.jobForm.get('workingDays')?.setValue(next);
  }

  get isRemoteCtrl(): boolean { return !!this.jobForm.get('isRemote')?.value; }
  get isSalaryHidden(): boolean { return !!this.jobForm.get('salaryHidden')?.value; }

  // ─── Logo ─────────────────────────────────────────────────────
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

  // ─── Modal ───────────────────────────────────────────────────
  openAddModal(): void {
    this.editingJob.set(null);
    this.jobForm.reset({
      jobType: 'Full-time', workMode: 'On-site', salaryType: 'Monthly',
      salaryCurrency: 'GBP', shiftType: 'Day', openings: 1,
      isRemote: false, salaryHidden: false, workingDays: [], skills: [],
    });
    this.resetDivisionState();
    this.applyDivisionValidators();
    this.applyPincodeValidators();
    this.selectedImages.set([]);
    this.selectedLogo.set(null);
    this.logoPreview.set(null);
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);
    this.showAddModal.set(true);
  }

  openEditModal(job: Job, event: Event): void {
    event.stopPropagation();
    this.editingJob.set(job);
    this.selectedImages.set([]);
    this.selectedLogo.set(null);
    this.logoPreview.set(job.companyLogo ?? null);

    this.jobForm.patchValue({
      companyName:     job.companyName    ?? '',
      companyWebsite:  job.companyWebsite ?? '',
      title:           job.title,
      jobType:         job.jobType        ?? 'Full-time',
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
      isRemote:        job.isRemote       ?? false,
      pincode:         job.pincode        ?? '',
      fullAddress:     job.fullAddress    ?? '',
      shiftType:       job.shiftType      ?? 'Day',
      workStartTime:   job.workStartTime  ?? '',
      workEndTime:     job.workEndTime    ?? '',
      workingDays:     job.workingDays    ?? [],
      contactPerson:   job.contactPerson  ?? '',
      contactPhone:    job.contactPhone   ?? '',
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
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);
    this.showAddModal.set(true);
  }

  closeAddModal(): void { this.showAddModal.set(false); this.editingJob.set(null); }

  submitJob(): void {
    if (this.jobForm.invalid) { this.jobForm.markAllAsTouched(); return; }

    const editing = this.editingJob();
    if (editing) {
      this.doUpdateJob(editing);
    } else {
      this.doCreateJob();
    }
  }

  private doCreateJob(): void {
    this.submitting.set(true);
    const raw    = this.jobForm.value;
    const data   = this.buildJobPayload(raw);
    const images = this.selectedImages();
    const logo   = this.selectedLogo();

    this.jobService.createJob(data, images.length > 0 ? images : undefined, logo ?? undefined)
      .subscribe({
        next: (job) => {
          this.jobs.update(list => [job, ...list]);
          this.totalItems.update(v => v + 1);
          this.toast.success('Job posted successfully!');
          // Keep the popup (and its disabled/spinner button, so it can't be
          // double-submitted) up just long enough for the confirmation toast
          // to be visible above it, then close.
          setTimeout(() => { this.closeAddModal(); this.submitting.set(false); }, CONFIRM_CLOSE_DELAY_MS);
        },
        error: () => { this.toast.error('Failed to post job. Please try again.'); this.submitting.set(false); },
      });
  }

  private doUpdateJob(job: Job): void {
    this.editSubmitting.set(true);
    const raw    = this.jobForm.value;
    const data   = this.buildEditPayload(raw, job);
    const images = this.selectedImages();
    const logo   = this.selectedLogo();

    this.jobService.updateJob(job.id, data, images.length > 0 ? images : undefined, logo ?? undefined)
      .subscribe({
        next: (updated) => {
          this.jobs.update(list => list.map(j => j.id === updated.id ? updated : j));
          this.toast.success('Job updated successfully!');
          setTimeout(() => { this.closeAddModal(); this.editSubmitting.set(false); }, CONFIRM_CLOSE_DELAY_MS);
        },
        error: () => { this.toast.error('Failed to update job.'); this.editSubmitting.set(false); },
      });
  }

  // ─── Delete confirmation modal ───────────────────────────────
  openDeleteConfirm(job: Job, event: Event): void {
    event.stopPropagation();
    this.jobToDelete.set(job);
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirm.set(false);
    this.jobToDelete.set(null);
  }

  confirmDeleteJob(): void {
    const job = this.jobToDelete();
    if (!job) return;
    this.deleting.set(true);

    this.jobService.deleteJob(job.id).subscribe({
      next: () => {
        this.jobs.update(list => list.filter(j => j.id !== job.id));
        this.totalItems.update(v => v - 1);
        if (this.activeJobId() === job.id) this.activeJobId.set(null);
        this.toast.success('Job deleted successfully');
        setTimeout(() => {
          this.closeDeleteConfirm();
          // If this delete was confirmed from within the still-open detail
          // popup (stacked on top of it), close that too — nothing left to
          // show details for.
          if (this.detailJob()?.id === job.id) this.closeDetail();
          this.deleting.set(false);
        }, CONFIRM_CLOSE_DELAY_MS);
      },
      error: () => { this.toast.error('Failed to delete job'); this.deleting.set(false); },
    });
  }

  private buildJobPayload(raw: Record<string, any>): Record<string, any> {
    const country = this.geoCountries().find(c => c.id === raw['countryId']);
    const leafDivisionName = this.getLeafDivisionName();
    const cityName = this.selectedCityName();
    const phone   = (raw['contactDialCode'] && raw['contactPhone'])
      ? `${raw['contactDialCode']}${raw['contactPhone']}`
      : (raw['contactPhone'] ?? '');

    const payload: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (['countryId', 'division1Id', 'division2Id', 'cityId', 'contactDialCode'].includes(key)) continue;
      if (val === null || val === undefined || val === '') continue;
      if (Array.isArray(val) && val.length === 0) continue;
      payload[key] = val;
    }
    if (country)         payload['country'] = country.name;
    if (leafDivisionName) payload['state']  = leafDivisionName;
    if (cityName)        payload['city']    = cityName;
    if (phone)            payload['contactPhone'] = phone;
    return payload;
  }

  private buildEditPayload(raw: Record<string, any>, original: Job): Record<string, any> {
    const payload = this.buildJobPayload(raw);
    if (!payload['country'] && original.country) payload['country'] = original.country;
    if (!payload['state']   && original.state)   payload['state']   = original.state;
    if (!payload['city']    && original.city)     payload['city']    = original.city;
    return payload;
  }

  // ─── Pagination ──────────────────────────────────────────────
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.loadJobs(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }

  getPages(): number[] {
    const total = this.totalPages(), current = this.currentPage(), maxVis = 5;
    let start = Math.max(1, current - Math.floor(maxVis / 2));
    let end   = Math.min(total, start + maxVis - 1);
    start     = Math.max(1, end - maxVis + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // ─── Phone Validation ────────────────────────────────────────
  getPhoneError(): string | null {
    const dialCode = this.jobForm.get('contactDialCode')?.value ?? '';
    const phone    = this.jobForm.get('contactPhone')?.value ?? '';
    if (!phone) return null;
    if (!dialCode) return 'Please select a dial code first';
    const rule = getPhoneRule(dialCode);
    if (rule.pattern && !rule.pattern.test(phone)) return rule.hint;
    return null;
  }

  // ─── Display Helpers ─────────────────────────────────────────
  getCurrencySymbol(code: string | undefined): string { return getCurrencySymbol(code); }

  getSalaryDisplay(job: Job): string {
    if (job.salaryHidden) return 'Not Disclosed';
    const sym  = getCurrencySymbol(job.salaryCurrency);
    const type = job.salaryType ? ` / ${job.salaryType}` : '';
    if (job.salaryMin != null && job.salaryMax != null) {
      return `${sym}${job.salaryMin.toLocaleString()} – ${sym}${job.salaryMax.toLocaleString()}${type}`;
    }
    if (job.salaryMin != null) return `From ${sym}${job.salaryMin.toLocaleString()}${type}`;
    if (job.salaryMax != null) return `Up to ${sym}${job.salaryMax.toLocaleString()}${type}`;
    return job.salary ?? '';
  }

  getExperienceLabel(job: Job): string {
    if (job.expMin == null && job.expMax == null) return '';
    if (job.expMin === 0 && job.expMax == null) return 'Fresher';
    if (job.expMin != null && job.expMax != null) return `${job.expMin}–${job.expMax} yrs`;
    if (job.expMin != null) return `${job.expMin}+ yrs`;
    return `Up to ${job.expMax} yrs`;
  }

  getFirstSkills(job: Job, max = 3): string[] { return (job.skills ?? []).slice(0, max); }
  getExtraSkillsCount(job: Job, max = 3): number { return Math.max(0, (job.skills?.length ?? 0) - max); }

  getLocationDisplay(job: Job): string {
    if (job.isRemote) return 'Remote';
    const parts = [job.city, job.state, job.country].filter(Boolean);
    return parts.join(', ') || job.location || '';
  }

  getLocationSubtext(job: Job): string {
    if (job.isRemote) return job.country ? `${job.country} applicants only` : '';
    if (job.fullAddress) return job.fullAddress;
    if (job.pincode) return `Postcode ${job.pincode}`;
    return '';
  }

  getCompanyLogoSrc(job: Job): string | null {
    return job.companyLogo ?? (job.images?.length ? job.images[0] : null);
  }

  hasDescription(job: Job): boolean {
    return !!(job.description || job.responsibilities || job.qualifications || job.requirements || job.benefits);
  }

  shareJob(job: Job, event: Event): void {
    event.stopPropagation();
    const text = `${job.title}${job.companyName ? ' at ' + job.companyName : ''}`;
    if (navigator.share) {
      navigator.share({ title: job.title, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => this.toast.success('Copied to clipboard')).catch(() => {});
    }
  }

  // ─── Card Helpers ────────────────────────────────────────────
  getJobTypeBadgeClass(type: string | undefined): string {
    const m: Record<string, string> = {
      'Full-time': 'jb-badge jb-badge--fulltime', 'Part-time': 'jb-badge jb-badge--parttime',
      'Contract': 'jb-badge jb-badge--contract',  'Freelance': 'jb-badge jb-badge--freelance',
      'Internship': 'jb-badge jb-badge--internship', 'Temporary': 'jb-badge jb-badge--temporary',
    };
    return m[type ?? ''] ?? 'jb-badge jb-badge--default';
  }

  getWorkModeBadgeClass(mode: string | undefined): string {
    const m: Record<string, string> = {
      'Remote': 'jb-badge jb-badge--remote',
      'Hybrid': 'jb-badge jb-badge--hybrid',
      'On-site': 'jb-badge jb-badge--onsite',
    };
    return m[mode ?? ''] ?? 'jb-badge jb-badge--onsite';
  }

  getJobTypeFilterClass(type: string): string {
    const m: Record<string, string> = {
      'Full-time': 'filter-chip--fulltime', 'Part-time': 'filter-chip--parttime',
      'Contract': 'filter-chip--contract',  'Freelance': 'filter-chip--freelance',
      'Internship': 'filter-chip--internship', 'Temporary': 'filter-chip--temporary',
    };
    return m[type] ?? '';
  }

  getPosterInitials(job: Job): string {
    const name = job.companyName ?? job.user?.displayName ?? job.user?.userName ?? '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  }

  getContactInitials(job: Job): string {
    const name = job.contactPerson ?? job.companyName ?? '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  }

  getAvatarColor(job: Job): string {
    const colors = ['#F59E0B','#10B981','#3B82F6','#8B5CF6','#F97316','#06B6D4','#EC4899','#6366F1'];
    const name = job.companyName ?? job.user?.userName ?? job.id ?? '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  truncate(text: string | undefined, len: number): string {
    if (!text) return '';
    return text.length > len ? text.substring(0, len) + '…' : text;
  }

  inputVal(event: Event): string { return (event.target as HTMLInputElement).value; }
  inputNum(event: Event): number | null { const v = (event.target as HTMLInputElement).value; return v ? +v : null; }

  // ─── Form Init ───────────────────────────────────────────────
  private initForm(): void {
    this.jobForm = this.fb.group({
      companyName:     ['', [Validators.required, Validators.minLength(2)]],
      companyWebsite:  ['', urlValidator],
      title:           ['', [Validators.required, Validators.minLength(3)]],
      jobType:         ['Full-time'],
      workMode:        ['On-site'],
      education:       [''],
      openings:        [1, [Validators.min(1)]],
      expMin:          [null],
      expMax:          [null],
      salaryType:      ['Monthly'],
      salaryCurrency:  ['GBP'],
      salaryMin:       [null, [Validators.min(0)]],
      salaryMax:       [null, [Validators.min(0)]],
      salaryHidden:    [false],
      isRemote:        [false],
      countryId:       [null],
      division1Id:     [null],
      division2Id:     [null],
      cityId:          [null],
      pincode:         [''],
      fullAddress:     [''],
      shiftType:       ['Day'],
      workStartTime:   [''],
      workEndTime:     [''],
      workingDays:     [[]],
      contactPerson:   [''],
      contactDialCode: [''],
      contactPhone:    [''],
      contactEmail:    ['', [Validators.email]],
      applicationUrl:  ['', urlValidator],
      skills:          [[]],
      description:     [''],
      responsibilities: [''],
      qualifications:   [''],
      requirements:     [''],
      benefits:         [''],
    }, {
      validators: [salaryRangeValidator, expRangeValidator],
    });
  }
}
