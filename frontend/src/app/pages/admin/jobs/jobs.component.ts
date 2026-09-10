import {
  Component, OnInit, OnDestroy, HostListener, ViewChild, inject, signal, computed
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { JobService, JobsQueryParams } from '../../../core/services/job.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService, MasterState, MasterCity } from '../../../core/services/master-data.service';
import { Country, Job, PaginatedResponse, VisibilityType } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { formatCompensation } from '../../../shared/utils/job-compensation';
import { to12h } from '../../../shared/utils/opening-hours';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { enumLabelKey, enumSelectOptions } from '../../../shared/constants/enum-labels';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';
import { environment } from '../../../../environments/environment';
import { JobFormModalComponent } from '../../../shared/components/job-form-modal/job-form-modal.component';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard';

type JobSharePlatform = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'email' | 'pinterest';

export interface FilterChip { key: string; label: string; value: any; }

const VIEW_STORAGE_KEY = 'admin-jobs:viewMode';

/**
 * How long a Save/Delete popup stays open (with its submit button disabled
 * and showing its spinner) after a successful action, before auto-closing —
 * long enough for the success toast to be clearly visible above the popup
 * rather than the popup vanishing the instant the toast appears.
 */
const CONFIRM_CLOSE_DELAY_MS = 900;

@Component({
  selector: 'app-admin-jobs',
  standalone: true,
  imports: [DateInputComponent,
    CommonModule, FormsModule, DatePipe, RouterLink,
    SearchableSelectComponent, ImageErrorHandlerDirective, ImageUrlPipe, ImageViewerComponent,
    SortBarComponent, ScrollLockDirective, TranslatePipe, EnumLabelPipe,
    JobFormModalComponent],
  templateUrl: './jobs.component.html',
  styleUrls: ['./jobs.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the job list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class AdminJobsComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('jobFormModal') jobFormModal?: JobFormModalComponent;

  hasUnsavedChanges(): boolean {
    return !!this.jobFormModal?.isDirty();
  }

  private translate = inject(TranslateService);
  private language = inject(LanguageService);
  private jobService        = inject(JobService);
  private layoutService     = inject(LayoutService);
  private toast             = inject(ToastService);
  private masterDataService = inject(MasterDataService);
  private destroy$          = new Subject<void>();

  // ─── Data ───────────────────────────────────────────────────
  jobs          = signal<Job[]>([]);
  loading       = signal(true);
  // Gates the full-page skeleton — true only until the very first fetch
  // resolves, then stays true forever after. Later fetches (stat-card
  // click, search, filter, sort) still flip `loading`, but the stats bar /
  // results meta / list stay mounted throughout instead of unmounting into
  // a skeleton and back, which read as the whole page blinking.
  pageReady     = signal(false);
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
  filterSkills        = signal('');
  filterVisaSponsorship   = signal('');
  filterReferralAvailable = signal<boolean | null>(null);
  filterSalaryHidden  = signal<boolean | null>(null);
  filterPostedWithin  = signal<number | null>(null);
  filterVisibilityType = signal<VisibilityType | ''>('');
  /** Recruiter/company account search — matches the posting user's username/display name. */
  filterPostedBy      = signal('');
  filterStatus        = signal<'active' | 'inactive' | ''>('');
  filterDateFrom      = signal('');
  filterDateTo        = signal('');
  sortBy              = signal<string>('newest');

  readonly statusFilterOptions: SelectOption[] = [
    { value: '',         label: 'admin.jobs.label.allStatus' },
    { value: 'active',   label: 'admin.jobs.label.active' },
    { value: 'inactive', label: 'admin.jobs.label.inactive' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize = signal(20);

  // ── Sort — same {field, dir} model as the Community/Events admin pages:
  // always-active 2-state toggle (ascending ↔ descending, re-clicking the
  // same column flips direction; picking a new column defaults to
  // descending), shared by the sort-bar (List view) and every sortable
  // Table-view column header. Jobs' backend sort is still a single combined
  // enum (newest/oldest/salary_high/salary_low/…), so the generic
  // {field, dir} used by the UI is translated to/from that enum here.
  readonly sortFields: SortField[] = [
    { key: 'date',   label: 'admin.jobs.label.date' },
    { key: 'salary', label: 'admin.jobs.label.salary' },
  ];

  private readonly sortFieldMap: Record<string, { asc: string; desc: string }> = {
    date:     { asc: 'oldest',          desc: 'newest' },
    salary:   { asc: 'salary_low',      desc: 'salary_high' },
    title:    { asc: 'title_az',        desc: 'title_za' },
    location: { asc: 'location_az',     desc: 'location_za' },
    type:     { asc: 'type_az',         desc: 'type_za' },
    status:   { asc: 'status_inactive', desc: 'status_active' },
    approval: { asc: 'approval_az',     desc: 'approval_za' },
  };

  activeSortField = signal<string>('date');
  activeSortDir   = signal<SortDir>('desc');

  sortBarField = computed<string>(() => this.activeSortField());
  sortBarDir   = computed<SortDir>(() => this.activeSortDir());

  private applyActiveSort(): void {
    const map = this.sortFieldMap[this.activeSortField()];
    this.sortBy.set(map ? (this.activeSortDir() === 'asc' ? map.asc : map.desc) : 'newest');
    this.loadJobs(1);
  }

  /** Sort-bar widget (List view) — its own 2-state asc/desc toggle. */
  onSortBarChange(change: SortChange): void {
    this.activeSortField.set(change.sortBy);
    this.activeSortDir.set(change.sortDir);
    this.applyActiveSort();
  }

  /** Table-view column header click — re-clicking the same column flips direction. */
  toggleColumnSort(field: string): void {
    if (this.activeSortField() === field) {
      this.activeSortDir.set(this.activeSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.activeSortField.set(field);
      this.activeSortDir.set('desc');
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
    // Recompute these labels when the reader switches language.
    this.language.currentLang();
    const chips: FilterChip[] = [];
    const add = (key: string, label: string, value: any) => chips.push({ key, label, value });
    if (this.searchQuery())           add('search',       this.translate.instant('filters.search', { value: this.searchQuery() }), this.searchQuery());
    if (this.filterJobType())         add('jobType',      this.translate.instant(enumLabelKey('jobType', this.filterJobType())), this.filterJobType());
    if (this.filterWorkMode())        add('workMode',     this.translate.instant(enumLabelKey('workMode', this.filterWorkMode())), this.filterWorkMode());
    if (this.filterCountry())         add('country',      this.filterCountry(), this.filterCountry());
    if (this.filterState())           add('state',        this.filterState(), this.filterState());
    if (this.filterCity())            add('city',         this.filterCity(), this.filterCity());
    if (this.filterCompanyName())     add('companyName',  this.filterCompanyName(), this.filterCompanyName());
    if (this.filterSkills())          add('skills',       this.translate.instant('filters.skill', { value: this.filterSkills() }), this.filterSkills());
    if (this.filterVisaSponsorship()) add('visaSponsorship', this.translate.instant(enumLabelKey('visaSponsorship', this.filterVisaSponsorship())), this.filterVisaSponsorship());
    if (this.filterReferralAvailable() != null) add('referralAvailable', this.translate.instant('admin.jobs.referralAvailable'), this.filterReferralAvailable());
    if (this.filterShiftType())       add('shiftType',    this.translate.instant(enumLabelKey('shiftType', this.filterShiftType())), this.filterShiftType());
    if (this.filterEducation())       add('education',    this.translate.instant(enumLabelKey('education', this.filterEducation())), this.filterEducation());
    if (this.filterExpMin() != null)  add('expMin',       this.translate.instant('filters.expMin', { years: this.filterExpMin() }), this.filterExpMin());
    if (this.filterExpMax() != null)  add('expMax',       this.translate.instant('filters.expMax', { years: this.filterExpMax() }), this.filterExpMax());
    if (this.filterSalaryMin() != null) add('salaryMin',  this.translate.instant('filters.salaryMin', { amount: this.filterSalaryMin() }), this.filterSalaryMin());
    if (this.filterSalaryMax() != null) add('salaryMax',  this.translate.instant('filters.salaryMax', { amount: this.filterSalaryMax() }), this.filterSalaryMax());
    if (this.filterSalaryHidden() === true)  add('salaryHidden', this.translate.instant('filters.salaryHidden'), true);
    if (this.filterPostedWithin() != null) {
      const keys: Record<number, string> = {
        1: 'filters.postedToday', 7: 'filters.postedDays7', 30: 'filters.postedDays30',
      };
      const days = this.filterPostedWithin()!;
      add('postedWithin', keys[days]
        ? this.translate.instant(keys[days])
        : this.translate.instant('filters.postedDaysN', { days }), days);
    }
    if (this.filterVisibilityType()) {
      const key = this.filterVisibilityType() === 'WORLDWIDE' ? 'components.businessForm.visibilityWorldwide' : 'components.businessForm.visibilityCountry';
      add('visibilityType', this.translate.instant(key), this.filterVisibilityType());
    }
    if (this.filterPostedBy()) add('postedBy', this.filterPostedBy(), this.filterPostedBy());
    if (this.filterStatus())   add('status',   this.translate.instant(enumLabelKey('activeStatus', this.filterStatus())), this.filterStatus());
    if (this.filterDateFrom()) add('dateFrom', this.translate.instant('filters.dateFrom', { date: this.filterDateFrom() }), this.filterDateFrom());
    if (this.filterDateTo())   add('dateTo',   this.translate.instant('filters.dateTo', { date: this.filterDateTo() }), this.filterDateTo());
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

  // ─── Add/Edit Job modal — the form itself is app-job-form-modal (shared
  // with the user Jobs page), so this page only owns *which* job is being
  // edited and what to do once it saves. ──────────────────────────────
  showAddModal = signal(false);
  editJobId    = signal<string | null>(null);

  // ─── Delete confirmation modal (for accordion body action) ───
  showDeleteConfirm = signal(false);
  jobToDelete       = signal<Job | null>(null);
  deleting          = signal(false);

  // ─── Share modal — native Web Share API is tried first (see
  // shareJob()); this popup is the fallback for browsers/desktops
  // without it, offering the same social platforms as the post-share
  // popup on the user-facing feeds. ─────────────────────────────
  shareModalOpen     = signal(false);
  shareTargetJob     = signal<Job | null>(null);
  sharePopupBlocked  = signal(false);
  blockedShareUrl    = signal<string | null>(null);

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

  // ─── Static Options ─────────────────────────────────────────
  readonly jobTypes    = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
  readonly jobTypeOptions: SelectOption[] = enumSelectOptions('jobType', this.jobTypes);
  readonly workModes   = ['Remote', 'Hybrid', 'On-site'] as const;
  readonly visaSponsorshipFilterValues = ['Available', 'Not Available', 'Not Specified'] as const;
  readonly shiftTypes  = ['Day', 'Night', 'Rotational', 'Flexible'] as const;

  readonly educationOptions: SelectOption[] = [
    { value: 'None',       label: 'admin.jobs.label.noEducationNeeded' },
    { value: '8th',        label: 'admin.jobs.label.k8th'                  },
    { value: '10th',       label: 'admin.jobs.label.k10th'                 },
    { value: '12th',       label: 'admin.jobs.label.k12th'                 },
    { value: 'Diploma',    label: 'admin.jobs.label.diploma'              },
    { value: 'ITI',        label: 'admin.jobs.label.iti'                  },
    { value: 'Any',        label: 'admin.jobs.label.graduate'         },
    { value: "Bachelor's", label: 'enums.education.bachelors' },
    { value: "Master's",   label: 'enums.education.masters' },
    { value: 'PhD',        label: 'admin.jobs.label.phd'                  },
  ];

  readonly expOptions: SelectOption[] = [
    { value: 0,  label: 'admin.jobs.label.fresher0Yrs' },
    { value: 1,  label: 'admin.jobs.label.k1Year'          },
    { value: 2,  label: 'admin.jobs.label.k2Years'         },
    { value: 3,  label: 'admin.jobs.label.k3Years'         },
    { value: 4,  label: 'admin.jobs.label.k4Years'         },
    { value: 5,  label: 'admin.jobs.label.k5Years'         },
    { value: 7,  label: 'admin.jobs.label.k7Years'         },
    { value: 10, label: 'admin.jobs.label.k10Years'        },
    { value: 15, label: 'admin.jobs.label.k15Years'       },
  ];

  readonly sortOptions: SelectOption[] = [
    { value: 'newest',      label: 'admin.jobs.label.newestFirst'   },
    { value: 'oldest',      label: 'admin.jobs.label.oldestFirst'   },
    { value: 'salary_high', label: 'admin.jobs.label.highestSalary' },
    { value: 'salary_low',  label: 'admin.jobs.label.lowestSalary'  },
    { value: 'company_az',  label: 'admin.jobs.label.companyZ'  },
  ];

  readonly postedWithinOptions: SelectOption[] = [
    { value: 1,  label: 'admin.jobs.label.today'        },
    { value: 7,  label: 'admin.jobs.label.last7Days'  },
    { value: 30, label: 'admin.jobs.label.last30Days' },
  ];

  readonly filterExpOptions: SelectOption[] = [
    { value: 0,  label: 'admin.jobs.label.fresher' }, { value: 1,  label: 'admin.jobs.label.k1Yr'   },
    { value: 2,  label: 'admin.jobs.label.k2Yrs'  }, { value: 3,  label: 'admin.jobs.label.k3Yrs'  },
    { value: 5,  label: 'admin.jobs.label.k5Yrs'  }, { value: 7,  label: 'admin.jobs.label.k7Yrs'  },
    { value: 10, label: 'admin.jobs.label.k10Yrs' }, { value: 15, label: 'admin.jobs.label.k15Yrs'},
  ];

  // ─── Stats ──────────────────────────────────────────────────
  // Stat-card counts — fetched separately (see loadJobTypeCounts()) so each
  // card always shows its own true total regardless of which card is
  // currently selected, instead of being derived from whatever page
  // `jobs()` currently holds (which — once a card filters the list — no
  // longer contains any of the OTHER cards' jobs, making their counts
  // collapse to 0 and making the stat bar look broken).
  totalJobsCount = signal(0);
  jobTypeCounts  = signal<Record<string, number>>({});

  // ─── Lifecycle ───────────────────────────────────────────────
  ngOnInit(): void {
    this.restoreSavedViewMode();
    this.loadJobs(1);
    this.loadCountries();
  }

  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'list' || saved === 'table') this.viewMode.set(saved);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.layoutService.forceSidebarCollapsed.set(false);
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

  // ─── Data Loading ────────────────────────────────────────────
  loadJobs(page = 1): void {
    this.loading.set(true);
    this.currentPage.set(page);
    this.activeJobId.set(null);
    this.loadJobTypeCounts();

    const query: JobsQueryParams = { page, limit: this.pageSize() };
    if (this.searchQuery().trim())    query.search      = this.searchQuery().trim();
    if (this.filterJobType())         query.jobType     = this.filterJobType();
    if (this.filterWorkMode())        query.workMode    = this.filterWorkMode();
    if (this.filterCountry())         query.country     = this.filterCountry();
    if (this.filterState())           query.state       = this.filterState();
    if (this.filterCity())            query.city        = this.filterCity();
    if (this.filterShiftType())       query.shiftType   = this.filterShiftType();
    if (this.filterEducation())       query.education   = this.filterEducation();
    // Was previously never applied to the query despite driving a signal
    // and an active-filter chip — a UI-only filter that didn't actually
    // filter anything. Folded into `search` the same way the User page
    // already does it, since there's no dedicated company-name param.
    if (this.filterCompanyName())     query.search      = (query.search ? query.search + ' ' : '') + this.filterCompanyName();
    if (this.filterSkills())          query.skills      = this.filterSkills();
    if (this.filterVisaSponsorship()) query.visaSponsorship = this.filterVisaSponsorship() as any;
    if (this.filterReferralAvailable() != null) query.referralAvailable = this.filterReferralAvailable()!;
    if (this.filterExpMin() != null)  query.expMin      = this.filterExpMin()!;
    if (this.filterExpMax() != null)  query.expMax      = this.filterExpMax()!;
    if (this.filterSalaryMin() != null) query.salaryMin = this.filterSalaryMin()!;
    if (this.filterSalaryMax() != null) query.salaryMax = this.filterSalaryMax()!;
    if (this.filterSalaryHidden() != null) query.salaryHidden = this.filterSalaryHidden()!;
    if (this.filterPostedWithin() != null) query.postedWithin = this.filterPostedWithin()!;
    if (this.filterVisibilityType())  query.visibilityType = this.filterVisibilityType() as VisibilityType;
    if (this.filterPostedBy())        query.postedBy    = this.filterPostedBy();
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
        this.pageReady.set(true);
      },
      error: () => { this.toast.error('admin.jobs.toast.failedLoadJobs'); this.loading.set(false); this.pageReady.set(true); },
    });
  }

  /** Powers the stat cards (Total/Full-time/Part-time/Contract) — lightweight
   * `limit:1` calls scoped by every OTHER active filter (search, mode,
   * location, experience, salary, status, date) but never `jobType` itself,
   * so each count stays accurate no matter which card is currently selected. */
  private loadJobTypeCounts(): void {
    const base: JobsQueryParams = { page: 1, limit: 1 };
    if (this.searchQuery().trim())    base.search      = this.searchQuery().trim();
    if (this.filterWorkMode())        base.workMode    = this.filterWorkMode();
    if (this.filterCountry())         base.country     = this.filterCountry();
    if (this.filterState())           base.state       = this.filterState();
    if (this.filterCity())            base.city        = this.filterCity();
    if (this.filterShiftType())       base.shiftType   = this.filterShiftType();
    if (this.filterEducation())       base.education   = this.filterEducation();
    if (this.filterExpMin() != null)  base.expMin      = this.filterExpMin()!;
    if (this.filterExpMax() != null)  base.expMax      = this.filterExpMax()!;
    if (this.filterSalaryMin() != null) base.salaryMin = this.filterSalaryMin()!;
    if (this.filterSalaryMax() != null) base.salaryMax = this.filterSalaryMax()!;
    if (this.filterSalaryHidden() != null) base.salaryHidden = this.filterSalaryHidden()!;
    if (this.filterPostedWithin() != null) base.postedWithin = this.filterPostedWithin()!;
    if (this.filterVisibilityType())  base.visibilityType = this.filterVisibilityType() as VisibilityType;
    if (this.filterPostedBy())        base.postedBy    = this.filterPostedBy();
    if (this.filterStatus())          base.status      = this.filterStatus() as 'active' | 'inactive';
    if (this.filterDateFrom())        base.dateFrom    = this.filterDateFrom();
    if (this.filterDateTo())          base.dateTo      = this.filterDateTo();

    this.jobService.getJobs(base).subscribe({
      next: (res) => this.totalJobsCount.set(res.total), error: () => {},
    });

    const types = ['Full-time', 'Part-time', 'Contract'];
    const counts: Record<string, number> = {};
    types.forEach(type => {
      this.jobService.getJobs({ ...base, jobType: type }).subscribe({
        next: (res) => { counts[type] = res.total; this.jobTypeCounts.set({ ...counts }); },
        error: () => {},
      });
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
    }
    // Presets with no table-column equivalent (e.g. "Company (A→Z)") leave
    // activeSortField/Dir — and therefore the table's highlighted column —
    // as whatever it was before; there's no column to point it at instead.
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

  /** Advanced Filters lives in a right-side drawer — while it's open, the
   * app shell's sidebar auto-minimizes (via LayoutService) for extra width. */
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
    this.layoutService.forceSidebarCollapsed.set(this.showAdvancedFilters());
  }

  closeAdvancedFilters(): void {
    this.showAdvancedFilters.set(false);
    this.layoutService.forceSidebarCollapsed.set(false);
  }

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
      case 'skills':       this.filterSkills.set('');        break;
      case 'visaSponsorship':   this.filterVisaSponsorship.set('');   break;
      case 'referralAvailable': this.filterReferralAvailable.set(null); break;
      case 'shiftType':    this.filterShiftType.set('');     break;
      case 'education':    this.filterEducation.set('');     break;
      case 'expMin':       this.filterExpMin.set(null);      break;
      case 'expMax':       this.filterExpMax.set(null);      break;
      case 'salaryMin':    this.filterSalaryMin.set(null);   break;
      case 'salaryMax':    this.filterSalaryMax.set(null);   break;
      case 'salaryHidden': this.filterSalaryHidden.set(null); break;
      case 'postedWithin': this.filterPostedWithin.set(null); break;
      case 'visibilityType': this.filterVisibilityType.set(''); break;
      case 'postedBy':     this.filterPostedBy.set('');        break;
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

  setVisibilityTypeFilter(v: VisibilityType | ''): void {
    this.filterVisibilityType.set(this.filterVisibilityType() === v ? '' : v);
    this.triggerFilteredLoad();
  }

  onFilterPostedByChange(value: string): void {
    this.filterPostedBy.set(value);
    this.triggerFilteredLoad();
  }

  onFilterDateFromChange(value: string): void {
    this.filterDateFrom.set(value);
    this.loadJobs(1);
  }

  onFilterDateToChange(value: string): void {
    this.filterDateTo.set(value);
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
    this.filterSkills.set('');
    this.filterVisaSponsorship.set(''); this.filterReferralAvailable.set(null);
    this.filterExpMin.set(null); this.filterExpMax.set(null);
    this.filterSalaryMin.set(null); this.filterSalaryMax.set(null);
    this.filterSalaryHidden.set(null); this.filterPostedWithin.set(null);
    this.filterVisibilityType.set(''); this.filterPostedBy.set('');
    this.filterStatus.set(''); this.filterDateFrom.set(''); this.filterDateTo.set('');
    this.filterStates.set([]); this.filterCities.set([]);
    this.sortBy.set('newest');
    this.activeSortField.set('date');
    this.activeSortDir.set('desc');
    this.loadJobs(1);
  }

  // filteredJobs (all jobs are already server-filtered)
  filteredJobs = computed(() => this.jobs());


  // ─── Add/Edit Job modal ───────────────────────────────────────
  openAddModal(): void {
    this.editJobId.set(null);
    this.showAddModal.set(true);
  }

  openEditModal(job: Job, event: Event): void {
    event.stopPropagation();
    // No prefetch here: the modal loads the full record itself.
    this.editJobId.set(job.id);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editJobId.set(null);
  }

  onJobSaved(job: Job): void {
    const wasEditing = this.editJobId() !== null;
    if (wasEditing) {
      this.jobs.update(list => list.map(j => j.id === job.id ? job : j));
    } else {
      this.jobs.update(list => [job, ...list]);
      this.totalItems.update(v => v + 1);
    }
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
        this.toast.success('admin.jobs.toast.jobDeletedSuccessfully');
        setTimeout(() => {
          this.closeDeleteConfirm();
          // If this delete was confirmed from within the still-open detail
          // popup (stacked on top of it), close that too — nothing left to
          // show details for.
          if (this.detailJob()?.id === job.id) this.closeDetail();
          this.deleting.set(false);
        }, CONFIRM_CLOSE_DELAY_MS);
      },
      error: () => { this.toast.error('admin.jobs.toast.failedDeleteJob'); this.deleting.set(false); },
    });
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

  // ─── Display Helpers ─────────────────────────────────────────
  getSalaryDisplay(job: Job): string {
    return formatCompensation(job, (key, params) => this.translate.instant(key, params));
  }

  getExperienceLabel(job: Job): string {
    if (job.expMin == null && job.expMax == null) return '';
    if (job.expMin === 0 && job.expMax == null) return this.translate.instant('jobs.value.expFresher');
    if (job.expMin != null && job.expMax != null) return this.translate.instant('jobs.value.expRange', { min: job.expMin, max: job.expMax });
    if (job.expMin != null) return this.translate.instant('jobs.value.expMinPlus', { min: job.expMin });
    return this.translate.instant('jobs.value.expUpTo', { max: job.expMax });
  }

  getFirstSkills(job: Job, max = 3): string[] { return (job.skills ?? []).slice(0, max); }
  getExtraSkillsCount(job: Job, max = 3): number { return Math.max(0, (job.skills?.length ?? 0) - max); }

  /**
   * `workMode` — not the separate `isRemote` flag — is the single source of
   * truth for what's displayed here. The two used to be independently
   * settable in the Add/Edit Job form and could drift apart (a job could be
   * work_mode='On-site' with is_remote=true), which is exactly what made
   * On-site jobs wrongly show "Remote" on cards/detail. The backend now
   * derives is_remote from workMode on every save, but this display logic
   * reads workMode directly regardless, so it can never regress.
   */
  getLocationDisplay(job: Job): string {
    if (job.workMode === 'Remote') return this.translate.instant('jobs.value.remote');
    const parts = [job.city, job.state, job.country].filter(Boolean);
    return parts.join(', ') || job.location || '';
  }

  /**
   * Remote: the country here is the applicant-country eligibility
   * restriction ("Germany applicants only"), independent of Work Mode —
   * unchanged from before. Hybrid: prefixes the physical address with a
   * "Hybrid" label so it isn't mistaken for a plain On-site address.
   */
  getLocationSubtext(job: Job): string {
    if (job.workMode === 'Remote') {
      return job.country ? this.translate.instant('jobs.value.applicantsOnly', { country: job.country }) : '';
    }
    const address = job.fullAddress || (job.pincode ? this.translate.instant('jobs.value.postcode', { code: job.pincode }) : '');
    if (job.workMode === 'Hybrid') {
      const hybridLabel = this.translate.instant('enums.workMode.hybrid');
      return address ? `${hybridLabel} · ${address}` : hybridLabel;
    }
    return address;
  }

  /**
   * Formats workStartTime/workEndTime (stored as 24h "HH:mm") into the
   * same 12-hour AM/PM text the Add/Edit picker already shows, using the
   * same to12h() the Business module's opening hours already rely on —
   * one proven conversion, not a second reimplementation that could drift
   * out of sync or introduce its own AM/PM bug. Job Detail previously
   * showed the raw 24h string with no AM/PM at all, which is exactly what
   * made it inconsistent with the picker.
   *
   * Overnight shifts (e.g. 10:00 PM → 6:00 AM) are detected the same way
   * isOpenNow() does for Business hours — lexicographic end < start means
   * the shift crosses midnight — and flagged rather than silently
   * displayed as if the end time were earlier the same day.
   */
  getWorkingHoursDisplay(job: Job): { start: string; end: string; overnight: boolean } | null {
    if (!job.workStartTime || !job.workEndTime) return null;
    return {
      start: to12h(job.workStartTime),
      end: to12h(job.workEndTime),
      overnight: job.workEndTime < job.workStartTime,
    };
  }

  getCompanyLogoSrc(job: Job): string | null {
    return job.companyLogo ?? (job.images?.length ? job.images[0] : null);
  }

  hasDescription(job: Job): boolean {
    return !!(job.description || job.responsibilities || job.qualifications || job.requirements || job.benefits);
  }

  shareJob(job: Job, event: Event): void {
    event.stopPropagation();
    // Always shows the WhatsApp/Facebook/etc. popup instead of falling back
    // to navigator.share() — Chrome supports the native Web Share API (and
    // would otherwise hand off to the OS share sheet), but this popup should
    // be consistent across every browser.
    this.openShareModal(job);
  }

  openShareModal(job: Job): void {
    this.shareTargetJob.set(job);
    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    this.shareModalOpen.set(true);
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
    this.shareTargetJob.set(null);
    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
  }

  shareVia(platform: JobSharePlatform): void {
    const job = this.shareTargetJob();
    if (!job) return;

    const shareUrl = this.getJobShareUrl(job.id);
    const text = this.getJobShareText(job);
    const imageUrl = this.getJobShareImage(job);
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);
    const encodedTextWithUrl = encodeURIComponent(`${shareUrl}\n\n${text}`);
    const encodedImage = imageUrl ? encodeURIComponent(imageUrl) : '';

    let target = '';
    switch (platform) {
      case 'whatsapp':
        target = `https://wa.me/?text=${encodedTextWithUrl}`;
        break;
      case 'facebook':
        target = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'x':
        target = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'telegram':
        target = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        break;
      case 'linkedin':
        target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'email':
        target = `mailto:?subject=${encodeURIComponent(job.title)}&body=${encodedTextWithUrl}`;
        break;
      case 'pinterest':
        target = imageUrl
          ? `https://pinterest.com/pin/create/button/?url=${encodedUrl}&media=${encodedImage}&description=${encodedText}`
          : `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`;
        break;
    }

    if (platform === 'email') {
      window.location.href = target;
      return;
    }

    this.openShareTarget(target, platform);
  }

  private openShareTarget(target: string, platform: JobSharePlatform): void {
    const popupFeatures = platform === 'whatsapp' ? 'width=980,height=760' : 'width=680,height=720';

    const popup = window.open(target, '_blank', popupFeatures);
    if (!popup) {
      this.sharePopupBlocked.set(true);
      this.blockedShareUrl.set(target);
      return;
    }

    this.sharePopupBlocked.set(false);
    this.blockedShareUrl.set(null);
    popup.opener = null;
  }

  openShareInSameTab(): void {
    const target = this.blockedShareUrl();
    if (!target) return;
    window.location.href = target;
  }

  copyShareLink(): void {
    const job = this.shareTargetJob();
    if (!job) return;

    const shareUrl = this.getJobShareUrl(job.id);
    navigator.clipboard.writeText(shareUrl)
      .then(() => this.toast.success('admin.jobs.toast.shareLinkCopied'))
      .catch(() => this.toast.error('admin.jobs.toast.failedCopyShareLink'));
  }

  /** Touch-primary devices (phones/tablets) get the native mail/dialer
   * hand-off; anything else (including a narrow desktop browser window —
   * width alone isn't a reliable signal here) copies instead, since a
   * desktop `mailto:`/`tel:` click with no default app configured just
   * shows Windows' "Select an app" dialog instead of doing anything useful. */
  protected isTouchDevice(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  }

  onEmailClick(email: string | undefined, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!email) return;
    if (this.isTouchDevice()) { window.location.href = 'mailto:' + email; return; }
    navigator.clipboard.writeText(email)
      .then(() => this.toast.success('admin.jobs.toast.emailCopied'))
      .catch(() => this.toast.error('admin.jobs.toast.failedCopyEmail'));
  }

  onPhoneClick(phone: string | undefined, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!phone) return;
    if (this.isTouchDevice()) { window.location.href = 'tel:' + phone; return; }
    navigator.clipboard.writeText(phone)
      .then(() => this.toast.success('admin.jobs.toast.phoneCopied'))
      .catch(() => this.toast.error('admin.jobs.toast.failedCopyPhone'));
  }

  getShareText(job: Job): string {
    return this.getJobShareText(job);
  }

  private getJobShareText(job: Job): string {
    return job.companyName ? `${job.title} at ${job.companyName}` : job.title;
  }

  private getJobShareUrl(jobId: string): string {
    const base = this.getShareBaseOrigin();
    return `${base}/user/jobs?jobId=${jobId}`;
  }

  private getJobShareImage(job: Job): string | null {
    const path = job.companyLogo || job.images?.[0];
    return path ? this.resolveShareImageUrl(path) : null;
  }

  private resolveShareImageUrl(pathOrUrl: string): string {
    if (/^(https?:)?\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) {
      return pathOrUrl;
    }
    const base = environment.wsUrl || window.location.origin;
    const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${base.replace(/\/$/, '')}${normalized}`;
  }

  private getShareBaseOrigin(): string {
    const wsOrigin = (environment.wsUrl || '').trim();
    if (wsOrigin) return wsOrigin.replace(/\/$/, '');

    const apiUrl = (environment.apiUrl || '').trim();
    if (apiUrl) {
      try {
        return new URL(apiUrl, window.location.origin).origin;
      } catch {
        // ignore and fall back to current origin
      }
    }

    return window.location.origin.replace(/\/$/, '');
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

}
