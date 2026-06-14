import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  ReactiveFormsModule, FormsModule, FormBuilder, FormGroup,
  Validators, AbstractControl, ValidationErrors
} from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { JobService, JobsQueryParams } from '../../../core/services/job.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService, MasterState, MasterCity } from '../../../core/services/master-data.service';
import { Country, Job, PaginatedResponse } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { TagInputComponent } from '../../../shared/components/tag-input/tag-input.component';
import { CURRENCIES, getCurrencySymbol, getCurrencySelectOptions } from '../../../shared/constants/currencies';
import { getPhoneRule } from '../../../shared/utils/phone';

// ─── Validators ──────────────────────────────────────────────
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

// ─── Active filter chip model ────────────────────────────────
export interface FilterChip {
  key:   string;
  label: string;
  value: any;
}

@Component({
  selector: 'app-user-jobs',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, DatePipe,
    SearchableSelectComponent, FileUploadComponent, TagInputComponent,
  ],
  templateUrl: './jobs.component.html',
  styleUrls: ['./jobs.component.scss'],
})
export class UserJobsComponent implements OnInit, OnDestroy {
  private jobService        = inject(JobService);
  private authService       = inject(AuthService);
  private toast             = inject(ToastService);
  private masterDataService = inject(MasterDataService);
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

  // ─── Accordion ───────────────────────────────────────────────
  activeJobId = signal<string | null>(null);
  // Tracks which job descriptions are "show more" expanded
  expandedDescIds = signal<Set<string>>(new Set());

  isDescExpanded(jobId: string): boolean { return this.expandedDescIds().has(jobId); }
  toggleDescription(jobId: string, event: Event): void {
    event.stopPropagation();
    this.expandedDescIds.update(s => {
      const n = new Set(s);
      n.has(jobId) ? n.delete(jobId) : n.add(jobId);
      return n;
    });
  }

  /** Description is long if > 400 chars */
  isDescLong(job: Job): boolean { return (this.getDescription(job)?.length ?? 0) > 400; }
  getShortDescription(job: Job): string { return this.getDescription(job).substring(0, 400) + '…'; }

  // ─── Modal ───────────────────────────────────────────────────
  showAddModal    = signal(false);
  selectedImages  = signal<File[]>([]);
  selectedLogo    = signal<File | null>(null);
  logoPreview     = signal<string | null>(null);
  jobForm!: FormGroup;
  fileUploadReset = signal(0);
  logoUploadReset = signal(0);

  // ─── Edit mode ───────────────────────────────────────────────
  editingJob      = signal<Job | null>(null);   // null = create mode, set = edit mode
  editSubmitting  = signal(false);

  // ─── Delete confirmation modal ───────────────────────────────
  showDeleteConfirm  = signal(false);
  jobToDelete        = signal<Job | null>(null);
  deleting           = signal(false);

  // ─── Computed: current user helpers ─────────────────────────
  currentUserId  = computed(() => this.authService.currentUser()?.id ?? '');
  isAdmin        = computed(() => this.authService.currentUser()?.role === 'ADMIN');

  /** Returns true if the logged-in user can edit/delete this job */
  canEditJob(job: Job): boolean {
    return this.isAdmin() || job.userId === this.currentUserId();
  }

  // ─── Master data for cascades ────────────────────────────────
  countries     = signal<Country[]>([]);
  states        = signal<MasterState[]>([]);
  cities        = signal<MasterCity[]>([]);
  statesLoading = signal(false);
  citiesLoading = signal(false);

  // Filter location cascade (separate from form cascade)
  filterStates  = signal<MasterState[]>([]);
  filterCities  = signal<MasterCity[]>([]);
  filterStatesLoading = signal(false);
  filterCitiesLoading = signal(false);

  countryOptions = computed<SelectOption[]>(() =>
    this.countries().map(c => ({ value: c.name, label: `${c.flag_emoji} ${c.name}` }))
  );
  stateOptions = computed<SelectOption[]>(() =>
    this.states().map(s => ({ value: s.id, label: s.name }))
  );
  cityOptions = computed<SelectOption[]>(() =>
    this.cities().map(c => ({ value: c.id, label: c.name }))
  );
  filterStateOptions = computed<SelectOption[]>(() =>
    this.filterStates().map(s => ({ value: s.name, label: s.name }))
  );
  filterCityOptions = computed<SelectOption[]>(() =>
    this.filterCities().map(c => ({ value: c.name, label: c.name }))
  );
  dialCodeOptions = computed<SelectOption[]>(() =>
    this.countries().map(c => ({ value: c.dial_code, label: `${c.flag_emoji} ${c.dial_code}` }))
  );

  // ─── User Context ────────────────────────────────────────────
  userPincode = computed(() => this.authService.currentUser()?.pincode ?? '');

  // ═══════════════════════════════════════════════════════════
  // FILTER STATE
  // ═══════════════════════════════════════════════════════════

  // Basic filters
  searchQuery     = signal('');
  showAllJobs     = signal(false);
  filterJobType   = signal('');
  filterWorkMode  = signal('');
  filterCountry   = signal('');
  filterState     = signal('');
  filterCity      = signal('');
  sortBy          = signal<string>('newest');

  // Advanced filter panel visibility
  showAdvancedFilters = signal(false);

  // Advanced filters
  filterExpMin        = signal<number | null>(null);
  filterExpMax        = signal<number | null>(null);
  filterSalaryMin     = signal<number | null>(null);
  filterSalaryMax     = signal<number | null>(null);
  filterShiftType     = signal('');
  filterEducation     = signal('');
  filterCompanyName   = signal('');
  filterSalaryHidden  = signal<boolean | null>(null);
  filterPostedWithin  = signal<number | null>(null);

  private searchDebounce: any  = null;
  private filterDebounce: any  = null;

  // ─── Active filter chips ─────────────────────────────────────
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
    if (this.filterSalaryHidden() === false) add('salaryHidden', 'Salary shown', false);
    if (this.filterPostedWithin() != null) {
      const labels: Record<number, string> = { 1: 'Today', 7: 'Last 7 days', 30: 'Last 30 days' };
      add('postedWithin', labels[this.filterPostedWithin()!] ?? `Last ${this.filterPostedWithin()} days`, this.filterPostedWithin());
    }
    return chips;
  });

  activeFilterCount = computed(() => this.activeFilterChips().length);

  // ─── Static Options ─────────────────────────────────────────
  readonly jobTypes    = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
  readonly jobTypeOptions: SelectOption[] = this.jobTypes.map(t => ({ value: t, label: t }));
  readonly workModes   = ['Remote', 'Hybrid', 'On-site'] as const;
  readonly shiftTypes  = ['Day', 'Night', 'Rotational', 'Flexible'] as const;
  readonly salaryTypes = ['Fixed', 'Hourly', 'Monthly', 'Annual'] as const;
  readonly workDays    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  readonly currencyOptions: SelectOption[] = getCurrencySelectOptions();

  readonly educationOptions: SelectOption[] = [
    { value: 'Any',         label: 'Any Graduate'      },
    { value: 'High School', label: 'High School'       },
    { value: 'Diploma',     label: 'Diploma'           },
    { value: "Bachelor's",  label: "Bachelor's Degree" },
    { value: "Master's",    label: "Master's Degree"   },
    { value: 'PhD',         label: 'PhD'               },
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
    { value: 'newest',      label: 'Newest First'     },
    { value: 'oldest',      label: 'Oldest First'     },
    { value: 'salary_high', label: 'Highest Salary'   },
    { value: 'salary_low',  label: 'Lowest Salary'    },
    { value: 'company_az',  label: 'Company (A → Z)'  },
  ];

  readonly postedWithinOptions: SelectOption[] = [
    { value: 1,  label: 'Today'        },
    { value: 7,  label: 'Last 7 Days'  },
    { value: 30, label: 'Last 30 Days' },
  ];

  readonly filterExpOptions: SelectOption[] = [
    { value: 0,  label: 'Fresher' },
    { value: 1,  label: '1 yr'   },
    { value: 2,  label: '2 yrs'  },
    { value: 3,  label: '3 yrs'  },
    { value: 5,  label: '5 yrs'  },
    { value: 7,  label: '7 yrs'  },
    { value: 10, label: '10 yrs' },
    { value: 15, label: '15+ yrs'},
  ];

  // ─── Lifecycle ───────────────────────────────────────────────
  ngOnInit(): void {
    this.initForm();
    this.loadJobs(1);
    this.loadCountries();
    this.subscribeToSalaryHidden();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    if (this.filterDebounce) clearTimeout(this.filterDebounce);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Load countries ──────────────────────────────────────────
  private loadCountries(): void {
    this.masterDataService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.countries.set(data),
      error: () => {},
    });
  }

  // ─── Salary hidden reactive ──────────────────────────────────
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

  // ─── Form cascade (modal) ────────────────────────────────────
  onCountryChange(countryId: any): void {
    this.jobForm.get('stateId')?.setValue(null);
    this.jobForm.get('cityId')?.setValue(null);
    this.states.set([]); this.cities.set([]);
    if (countryId) {
      this.statesLoading.set(true);
      this.masterDataService.getStates(Number(countryId))
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: s => { this.states.set(s); this.statesLoading.set(false); }, error: () => this.statesLoading.set(false) });
    }
  }

  onStateChange(stateId: any): void {
    this.jobForm.get('cityId')?.setValue(null);
    this.cities.set([]);
    if (stateId) {
      this.citiesLoading.set(true);
      this.masterDataService.getCities(Number(stateId))
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: c => { this.cities.set(c); this.citiesLoading.set(false); }, error: () => this.citiesLoading.set(false) });
    }
  }

  // ─── Filter cascade (filter panel — uses name not ID) ────────
  onFilterCountryChange(countryName: any): void {
    this.filterCountry.set(countryName ?? '');
    this.filterState.set('');
    this.filterCity.set('');
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
    this.filterState.set(stateName ?? '');
    this.filterCity.set('');
    this.filterCities.set([]);

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

  onFilterCityChange(cityName: any): void {
    this.filterCity.set(cityName ?? '');
    this.triggerFilteredLoad();
  }

  // ─── Data Loading ────────────────────────────────────────────
  loadJobs(page = 1): void {
    this.loading.set(true);
    this.currentPage.set(page);
    this.activeJobId.set(null);

    const query: JobsQueryParams = { page };

    if (!this.showAllJobs() && this.userPincode()) query.pincode  = this.userPincode();
    if (this.searchQuery().trim())    query.search      = this.searchQuery().trim();
    if (this.filterJobType())         query.jobType     = this.filterJobType();
    if (this.filterWorkMode())        query.workMode    = this.filterWorkMode();
    if (this.filterCountry())         query.country     = this.filterCountry();
    if (this.filterState())           query.state       = this.filterState();
    if (this.filterCity())            query.city        = this.filterCity();
    if (this.filterShiftType())       query.shiftType   = this.filterShiftType();
    if (this.filterEducation())       query.education   = this.filterEducation();
    if (this.filterCompanyName())     query.search      = (query.search ? query.search + ' ' : '') + this.filterCompanyName();
    if (this.filterExpMin() != null)  query.expMin      = this.filterExpMin()!;
    if (this.filterExpMax() != null)  query.expMax      = this.filterExpMax()!;
    if (this.filterSalaryMin() != null) query.salaryMin = this.filterSalaryMin()!;
    if (this.filterSalaryMax() != null) query.salaryMax = this.filterSalaryMax()!;
    if (this.filterSalaryHidden() != null) query.salaryHidden = this.filterSalaryHidden()!;
    if (this.filterPostedWithin() != null) query.postedWithin = this.filterPostedWithin()!;
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

  // ─── Filter setters ──────────────────────────────────────────
  private triggerFilteredLoad(): void {
    if (this.filterDebounce) clearTimeout(this.filterDebounce);
    this.filterDebounce = setTimeout(() => this.loadJobs(1), 350);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.loadJobs(1), 300);
  }

  clearSearch(): void { this.searchQuery.set(''); this.loadJobs(1); }

  setJobTypeFilter(type: string): void {
    this.filterJobType.set(this.filterJobType() === type ? '' : type);
    this.triggerFilteredLoad();
  }

  setWorkModeFilter(mode: string): void {
    this.filterWorkMode.set(this.filterWorkMode() === mode ? '' : mode);
    this.triggerFilteredLoad();
  }

  setSortBy(value: any): void {
    this.sortBy.set(value ?? 'newest');
    this.loadJobs(1);
  }

  setAdvancedFilter(signal: any, value: any): void {
    signal.set(value ?? null);
    this.triggerFilteredLoad();
  }

  setPostedWithin(days: number | null): void {
    this.filterPostedWithin.set(this.filterPostedWithin() === days ? null : days);
    this.triggerFilteredLoad();
  }

  setSalaryHiddenFilter(val: boolean | null): void {
    this.filterSalaryHidden.set(this.filterSalaryHidden() === val ? null : val);
    this.triggerFilteredLoad();
  }

  toggleShowAllJobs(): void {
    this.showAllJobs.update(v => !v);
    this.loadJobs(1);
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
  }

  // ─── Remove individual filter chip ───────────────────────────
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
    }
    this.loadJobs(1);
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.filterJobType.set('');
    this.filterWorkMode.set('');
    this.filterCountry.set('');
    this.filterState.set('');
    this.filterCity.set('');
    this.filterShiftType.set('');
    this.filterEducation.set('');
    this.filterCompanyName.set('');
    this.filterExpMin.set(null);
    this.filterExpMax.set(null);
    this.filterSalaryMin.set(null);
    this.filterSalaryMax.set(null);
    this.filterSalaryHidden.set(null);
    this.filterPostedWithin.set(null);
    this.filterStates.set([]);
    this.filterCities.set([]);
    this.sortBy.set('newest');
    this.loadJobs(1);
  }

  // ─── Accordion ───────────────────────────────────────────────
  toggleAccordion(id: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.activeJobId.update(cur => cur === id ? null : id);
  }

  // ─── Working Days (modal form) ───────────────────────────────
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
    this.states.set([]); this.cities.set([]);
    this.selectedImages.set([]);
    this.selectedLogo.set(null);
    this.logoPreview.set(null);
    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);
    this.showAddModal.set(true);
  }

  /** Open the modal pre-filled with an existing job for editing */
  openEditModal(job: Job, event: Event): void {
    event.stopPropagation();
    this.editingJob.set(job);
    this.states.set([]); this.cities.set([]);
    this.selectedImages.set([]);
    this.selectedLogo.set(null);
    this.logoPreview.set(job.companyLogo ?? null);

    // Patch all form values from the existing job
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
      // location IDs are unknown from the stored strings — use free-text fields
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
    });
    // For location: keep country/state/city as free-text using the stored names
    // We set them as strings directly — the payload builder will use them as-is
    this.jobForm.get('countryId')?.setValue(null);   // clear cascade IDs
    this.jobForm.get('stateId')?.setValue(null);
    this.jobForm.get('cityId')?.setValue(null);

    this.fileUploadReset.update(v => v + 1);
    this.logoUploadReset.update(v => v + 1);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editingJob.set(null);
  }

  submitJob(): void {
    if (this.jobForm.invalid) { this.jobForm.markAllAsTouched(); return; }

    const editing = this.editingJob();
    if (editing) {
      this.updateJob(editing);
    } else {
      this.createNewJob();
    }
  }

  private createNewJob(): void {
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
          this.closeAddModal();
          this.submitting.set(false);
        },
        error: () => { this.toast.error('Failed to post job. Please try again.'); this.submitting.set(false); },
      });
  }

  private updateJob(job: Job): void {
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
          this.closeAddModal();
          this.editSubmitting.set(false);
        },
        error: () => { this.toast.error('Failed to update job. Please try again.'); this.editSubmitting.set(false); },
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
        this.closeDeleteConfirm();
        this.deleting.set(false);
      },
      error: () => { this.toast.error('Failed to delete job'); this.deleting.set(false); },
    });
  }

  private buildJobPayload(raw: Record<string, any>): Record<string, any> {
    const country = this.countries().find(c => c.id === raw['countryId']);
    const state   = this.states().find(s => s.id === raw['stateId']);
    const city    = this.cities().find(c => c.id === raw['cityId']);
    const phone   = (raw['contactDialCode'] && raw['contactPhone'])
      ? `${raw['contactDialCode']}${raw['contactPhone']}`
      : (raw['contactPhone'] ?? '');

    const payload: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (['countryId', 'stateId', 'cityId', 'contactDialCode'].includes(key)) continue;
      if (val === null || val === undefined || val === '') continue;
      if (Array.isArray(val) && val.length === 0) continue;
      payload[key] = val;
    }
    if (country) payload['country'] = country.name;
    if (state)   payload['state']   = state.name;
    if (city)    payload['city']    = city.name;
    if (phone)   payload['contactPhone'] = phone;
    return payload;
  }

  /** Same as buildJobPayload but also keeps fields that haven't changed (null-safe for edits) */
  private buildEditPayload(raw: Record<string, any>, original: Job): Record<string, any> {
    const payload = this.buildJobPayload(raw);
    // Preserve original location strings if no new cascade IDs were selected
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

  getPages(): number[] {
    const total = this.totalPages(), current = this.currentPage(), maxVis = 5;
    let start = Math.max(1, current - Math.floor(maxVis / 2));
    let end   = Math.min(total, start + maxVis - 1);
    start     = Math.max(1, end - maxVis + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // ─── Phone validation ─────────────────────────────────────────
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

  getLocationDisplay(job: Job): string {
    if (job.isRemote) return 'Remote';
    const parts = [job.city, job.state, job.country].filter(Boolean);
    return parts.join(', ') || job.location || '';
  }

  getCompanyLogoSrc(job: Job): string | null {
    return job.companyLogo ?? (job.images?.length ? job.images[0] : null);
  }

  hasDescription(job: Job): boolean {
    return !!(job.description || job.responsibilities || job.qualifications || job.requirements || job.benefits);
  }

  getDescription(job: Job): string {
    return job.description
      ?? [job.responsibilities, job.qualifications, job.requirements, job.benefits]
         .filter(Boolean).join('\n\n');
  }

  getFirstSkills(job: Job, max = 3): string[] {
    return (job.skills ?? []).slice(0, max);
  }

  getExtraSkillsCount(job: Job, max = 3): number {
    return Math.max(0, (job.skills?.length ?? 0) - max);
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
      'Contract':  'jb-badge jb-badge--contract',  'Freelance': 'jb-badge jb-badge--freelance',
      'Internship':'jb-badge jb-badge--internship', 'Temporary':'jb-badge jb-badge--temporary',
    };
    return m[type ?? ''] ?? 'jb-badge jb-badge--default';
  }

  getWorkModeBadgeClass(mode: string | undefined): string {
    const m: Record<string, string> = {
      'Remote': 'jb-badge jb-badge--remote',
      'Hybrid': 'jb-badge jb-badge--hybrid',
      'On-site':'jb-badge jb-badge--onsite',
    };
    return m[mode ?? ''] ?? 'jb-badge jb-badge--onsite';
  }

  getPosterInitials(job: Job): string {
    const name = job.companyName ?? job.user?.displayName ?? job.user?.userName ?? '?';
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

  /** Extract typed value from an input event — avoids 'as' casts in templates */
  inputVal(event: Event): string { return (event.target as HTMLInputElement).value; }
  inputNum(event: Event): number | null { const v = (event.target as HTMLInputElement).value; return v ? +v : null; }

  // ─── Form Init ───────────────────────────────────────────────
  private initForm(): void {
    this.jobForm = this.fb.group({
      companyName:    ['', [Validators.required, Validators.minLength(2)]],
      companyWebsite: ['', urlValidator],
      title:          ['', [Validators.required, Validators.minLength(3)]],
      jobType:        ['Full-time'],
      workMode:       ['On-site'],
      education:      [''],
      openings:       [1, [Validators.min(1)]],
      expMin:         [null],
      expMax:         [null],
      salaryType:     ['Monthly'],
      salaryCurrency: ['GBP'],
      salaryMin:      [null, [Validators.min(0)]],
      salaryMax:      [null, [Validators.min(0)]],
      salaryHidden:   [false],
      isRemote:       [false],
      countryId:      [null],
      stateId:        [null],
      cityId:         [null],
      pincode:        [''],
      fullAddress:    [''],
      shiftType:      ['Day'],
      workStartTime:  [''],
      workEndTime:    [''],
      workingDays:    [[]],
      contactPerson:  [''],
      contactDialCode:[''],
      contactPhone:   [''],
      contactEmail:   ['', [Validators.email]],
      applicationUrl: ['', urlValidator],
      skills:         [[]],
      description:    [''],
    }, {
      validators: [salaryRangeValidator, expRangeValidator],
    });
  }
}
