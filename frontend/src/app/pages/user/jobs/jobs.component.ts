import {
  Component, OnInit, OnDestroy, HostListener, ElementRef, inject, signal, computed, effect, viewChildren
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { JobService, JobsQueryParams } from '../../../core/services/job.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { MasterDataService, MasterState, MasterCity } from '../../../core/services/master-data.service';
import { Country, Job, PaginatedResponse, VisibilityType } from '../../../core/models';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { InfiniteScrollDirective } from '../../../shared/directives/infinite-scroll.directive';
import { ScrollLockDirective } from '../../../shared/directives/scroll-lock.directive';
import { formatCompensation } from '../../../shared/utils/job-compensation';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { enumLabelKey, enumSelectOptions } from '../../../shared/constants/enum-labels';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';
import { environment } from '../../../../environments/environment';
import { JobFormModalComponent } from '../../../shared/components/job-form-modal/job-form-modal.component';

type JobSharePlatform = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'email' | 'pinterest';

// ─── Active filter chip model ────────────────────────────────
export interface FilterChip {
  key:   string;
  label: string;
  value: any;
}

/**
 * How long a Save/Delete popup stays open (with its submit button disabled
 * and showing its spinner) after a successful action, before auto-closing —
 * long enough for the success toast to be clearly visible above the popup
 * rather than the popup vanishing the instant the toast appears.
 */
const CONFIRM_CLOSE_DELAY_MS = 900;

@Component({
  selector: 'app-user-jobs',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DatePipe,
    SearchableSelectComponent, ImageUrlPipe, ImageViewerComponent,
    ImageErrorHandlerDirective, InfiniteScrollDirective, ScrollLockDirective, TranslatePipe, EnumLabelPipe,
    JobFormModalComponent],
  templateUrl: './jobs.component.html',
  styleUrls: ['./jobs.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the job list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class UserJobsComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private language = inject(LanguageService);
  private jobService        = inject(JobService);
  private authService       = inject(AuthService);
  private layoutService     = inject(LayoutService);
  private toast             = inject(ToastService);
  private masterDataService = inject(MasterDataService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private destroy$          = new Subject<void>();

  // ─── Data ───────────────────────────────────────────────────
  jobs          = signal<Job[]>([]);
  loading       = signal(true);
  submitting    = signal(false);
  skeletonItems = Array(5);

  // ─── Page tab — 'all' = public browse, 'pending' = the caller's own submissions ──
  pageTab             = signal<'all' | 'pending'>('all');
  myPendingJobsCount  = signal(0);

  // ── All/Pending tabs — sliding active-pill indicator, position/width
  // read from the real active button (same approach as the User Community
  // page's .uc-tab-indicator) instead of a fixed 50%/translateX(100%) split,
  // which ignores the row's flex gap and bleeds onto the neighbouring tab. ──
  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  tabIndicatorLeft  = signal(0);
  tabIndicatorWidth = signal(0);
  tabIndicatorReady = signal(false);

  constructor() {
    effect(() => {
      this.tabButtons();
      this.pageTab();
      this.updateTabIndicator();
    });
  }

  @HostListener('window:resize')
  onTabRowResize(): void {
    this.updateTabIndicator();
  }

  private updateTabIndicator(): void {
    const idx = this.pageTab() === 'all' ? 0 : 1;
    const btn = this.tabButtons()[idx]?.nativeElement;
    if (!btn) return;
    this.tabIndicatorLeft.set(btn.offsetLeft);
    this.tabIndicatorWidth.set(btn.offsetWidth);
    this.tabIndicatorReady.set(true);
  }

  // ─── Pagination ─────────────────────────────────────────────
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  // ─── Accordion ───────────────────────────────────────────────
  activeJobId = signal<string | null>(null);
  // Show-more/less for job description sub-fields — keyed by `${jobId}:${field}`
  // so Description/Responsibilities/Qualifications/Requirements/Benefits each
  // expand independently.
  expandedTextFields = signal<Set<string>>(new Set());

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
  imageViewerOpen = signal(false);
  imageViewerImages = signal<string[]>([]);
  imageViewerInitialIndex = signal(0);

  // ─── Modal ───────────────────────────────────────────────────
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
  // with the admin console), so this page only owns *which* job is being
  // edited and what to do once it saves. ──────────────────────────────
  showAddModal = signal(false);
  editJobId    = signal<string | null>(null);   // null = create mode, set = edit mode

  // ─── Job details popup — List/Grid view's eye icon opens the full
  // job data here instead of expanding it inline (Card view keeps
  // the inline accordion via activeJobId). ─────────────────────
  viewingJob = signal<Job | null>(null);

  openJobDetailsModal(job: Job, event: Event): void {
    event.stopPropagation();
    this.viewingJob.set(job);
  }

  closeJobDetailsModal(): void {
    this.viewingJob.set(null);
  }

  // ─── Delete confirmation modal ───────────────────────────────
  showDeleteConfirm  = signal(false);
  jobToDelete        = signal<Job | null>(null);
  deleting           = signal(false);

  // ─── Share modal — native Web Share API is tried first (see
  // shareJob()); this popup is the fallback for browsers/desktops
  // without it, offering the same social platforms as the post-share
  // popup on the dashboard/community feeds. ────────────────────
  shareModalOpen     = signal(false);
  shareTargetJob     = signal<Job | null>(null);
  sharePopupBlocked  = signal(false);
  blockedShareUrl    = signal<string | null>(null);

  // ─── Computed: current user helpers ─────────────────────────
  currentUserId  = computed(() => this.authService.currentUser()?.id ?? '');
  isAdmin        = computed(() => this.authService.currentUser()?.role === 'ADMIN');

  /** Returns true if the logged-in user can edit/delete this job */
  canEditJob(job: Job): boolean {
    return this.isAdmin() || job.userId === this.currentUserId();
  }

  // ─── Master data (dial-code picker + advanced filter only — the form's
  // own Location section below uses GeographyService instead) ─────────
  countries     = signal<Country[]>([]);

  // Filter location cascade (separate from form cascade)
  filterStates  = signal<MasterState[]>([]);
  filterCities  = signal<MasterCity[]>([]);
  filterStatesLoading = signal(false);
  filterCitiesLoading = signal(false);

  countryOptions = computed<SelectOption[]>(() =>
    this.countries().map(c => ({ value: c.name, label: `${c.flag_emoji} ${c.name}` }))
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

  // ═══════════════════════════════════════════════════════════
  // FILTER STATE
  // ═══════════════════════════════════════════════════════════

  // Basic filters
  searchQuery     = signal('');
  filterJobType   = signal('');
  filterWorkMode  = signal('');
  filterCountry   = signal('');
  filterState     = signal('');
  filterCity      = signal('');
  sortBy          = signal<string>('newest');

  /** Card = the full detailed listing (default); List = a dense single-line row. */
  jobViewMode = signal<'card' | 'list'>('card');
  setJobViewMode(mode: 'card' | 'list'): void { this.jobViewMode.set(mode); }

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
  filterVisibilityType = signal<VisibilityType | ''>('');

  private searchDebounce: any  = null;
  private filterDebounce: any  = null;

  // ─── Active filter chips ─────────────────────────────────────
  activeFilterChips = computed<FilterChip[]>(() => {
    // Recompute these labels when the reader switches language.
    this.language.currentLang();
    const chips: FilterChip[] = [];
    const add = (key: string, label: string, value: any) => chips.push({ key, label, value });

    if (this.searchQuery())           add('search',       this.translate.instant('filters.search', { value: this.searchQuery() }), this.searchQuery());
    if (this.filterJobType())         add('jobType',      this.translate.instant(enumLabelKey('jobType', this.filterJobType())), this.filterJobType());
    if (this.filterWorkMode())        add('workMode',     this.translate.instant(enumLabelKey('workMode', this.filterWorkMode())), this.filterWorkMode());
    // Country defaults to the viewer's own — only chip it when they've changed it.
    if (this.filterCountry() && this.filterCountry() !== this.getDefaultCountry()) add('country', this.filterCountry(), this.filterCountry());
    if (this.filterState())           add('state',        this.filterState(), this.filterState());
    if (this.filterCity())            add('city',         this.filterCity(), this.filterCity());
    if (this.filterCompanyName())     add('companyName',  this.filterCompanyName(), this.filterCompanyName());
    if (this.filterShiftType())       add('shiftType',    this.translate.instant(enumLabelKey('shiftType', this.filterShiftType())), this.filterShiftType());
    if (this.filterEducation())       add('education',    this.translate.instant(enumLabelKey('education', this.filterEducation())), this.filterEducation());
    if (this.filterExpMin() != null)  add('expMin',       this.translate.instant('filters.expMin', { years: this.filterExpMin() }), this.filterExpMin());
    if (this.filterExpMax() != null)  add('expMax',       this.translate.instant('filters.expMax', { years: this.filterExpMax() }), this.filterExpMax());
    if (this.filterSalaryMin() != null) add('salaryMin',  this.translate.instant('filters.salaryMin', { amount: this.filterSalaryMin() }), this.filterSalaryMin());
    if (this.filterSalaryMax() != null) add('salaryMax',  this.translate.instant('filters.salaryMax', { amount: this.filterSalaryMax() }), this.filterSalaryMax());
    if (this.filterSalaryHidden() === true)  add('salaryHidden', this.translate.instant('filters.salaryHidden'), true);
    if (this.filterSalaryHidden() === false) add('salaryHidden', this.translate.instant('filters.salaryShown'), false);
    if (this.filterVisibilityType()) {
      const key = this.filterVisibilityType() === 'WORLDWIDE' ? 'components.businessForm.visibilityWorldwide' : 'components.businessForm.visibilityCountry';
      add('visibilityType', this.translate.instant(key), this.filterVisibilityType());
    }
    if (this.filterPostedWithin() != null) {
      const keys: Record<number, string> = {
        1: 'filters.postedToday', 7: 'filters.postedDays7', 30: 'filters.postedDays30',
      };
      const days = this.filterPostedWithin()!;
      add('postedWithin', keys[days]
        ? this.translate.instant(keys[days])
        : this.translate.instant('filters.postedDaysN', { days }), days);
    }
    return chips;
  });

  activeFilterCount = computed(() => this.activeFilterChips().length);

  // ─── Static Options ─────────────────────────────────────────
  readonly jobTypes    = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
  readonly jobTypeOptions: SelectOption[] = enumSelectOptions('jobType', this.jobTypes);
  readonly workModes   = ['Remote', 'Hybrid', 'On-site'] as const;
  readonly shiftTypes  = ['Day', 'Night', 'Rotational', 'Flexible'] as const;

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

  readonly sortOptions: SelectOption[] = [
    { value: 'newest',      label: 'user.jobs.sortOption.newest' },
    { value: 'oldest',      label: 'user.jobs.sortOption.oldest' },
    { value: 'salary_high', label: 'user.jobs.sortOption.salaryHigh' },
    { value: 'salary_low',  label: 'user.jobs.sortOption.salaryLow' },
    { value: 'company_az',  label: 'user.jobs.sortOption.companyAz' },
  ];

  readonly postedWithinOptions: SelectOption[] = [
    { value: 1,  label: 'user.jobs.dateRange.today' },
    { value: 7,  label: 'user.jobs.dateRange.days7' },
    { value: 30, label: 'user.jobs.dateRange.days30' },
  ];

  readonly filterExpOptions: SelectOption[] = [
    { value: 0,  label: 'user.jobs.expShort.fresher' },
    { value: 1,  label: 'user.jobs.expShort.y1' },
    { value: 2,  label: 'user.jobs.expShort.y2' },
    { value: 3,  label: 'user.jobs.expShort.y3' },
    { value: 5,  label: 'user.jobs.expShort.y5' },
    { value: 7,  label: 'user.jobs.expShort.y7' },
    { value: 10, label: 'user.jobs.expShort.y10' },
    { value: 15, label: 'user.jobs.expShort.y15' },
  ];

  // ─── Lifecycle ───────────────────────────────────────────────
  ngOnInit(): void {
    // Default the Location filter to the viewer's own country — Country
    // Based jobs from other countries are invisible to them anyway (see
    // job-visibility.service.ts), so pre-filtering to "my country" starts
    // the list on jobs they can actually apply to. They can still widen it.
    this.filterCountry.set(this.getDefaultCountry());
    this.loadJobs(1);
    this.loadCountries();
    this.loadMyPendingJobsCount();

    // Deep-link support — e.g. the Profile page's "My Jobs" tab navigates
    // here with ?jobId=xxx to expand and scroll straight to that job's card.
    this.route.queryParams.subscribe(params => {
      const jobId = params['jobId'];
      if (jobId) this.openJobFromQueryParam(jobId);
      // Deep-link support — e.g. the Profile page's "My Jobs" tab
      // navigates here with ?openAdd=1 to jump straight into Add Job.
      if (params['openAdd']) {
        this.openAddModal();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { openAdd: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  /** The target job may not be on the currently loaded/filtered page —
   * fetched directly and prepended if it isn't already in `jobs()`. */
  private openJobFromQueryParam(id: string): void {
    this.jobService.getJob(id).subscribe({
      next: job => {
        if (!this.jobs().some(j => j.id === id)) {
          this.jobs.update(list => [job, ...list]);
        }
        setTimeout(() => this.toggleAccordion(id), 60);
      },
      error: () => this.toast.error('user.jobs.toast.jobNotFoundNoLonger'),
    });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { jobId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setPageTab(tab: 'all' | 'pending'): void {
    if (this.pageTab() === tab) return;
    this.pageTab.set(tab);
    if (tab === 'pending') {
      this.loadMyJobs();
    } else {
      this.loadJobs(1);
    }
  }

  /** "Pending Approval" tab — the caller's own jobs still awaiting admin
   * action: freshly submitted (PENDING) or kicked back for more info (NEEDS_INFO). */
  loadMyJobs(): void {
    this.loading.set(true);
    this.currentPage.set(1);
    this.activeJobId.set(null);
    this.jobService.getMyJobs({ page: 1, limit: 100, approvalStatus: ['PENDING', 'NEEDS_INFO'] }).subscribe({
      next: (res: PaginatedResponse<Job>) => {
        this.jobs.set(res.data);
        this.totalItems.set(res.total);
        this.totalPages.set(1);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('user.jobs.toast.failedLoadJobs');
        this.loading.set(false);
      },
    });
  }

  loadMyPendingJobsCount(): void {
    this.jobService.getMyJobs({ page: 1, limit: 1, approvalStatus: ['PENDING', 'NEEDS_INFO'] }).subscribe({
      next: (res: PaginatedResponse<Job>) => this.myPendingJobsCount.set(res.total),
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    if (this.filterDebounce) clearTimeout(this.filterDebounce);
    this.layoutService.forceSidebarCollapsed.set(false);
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

  // ─── Data Loading — true incremental server paging ────────────
  readonly PAGE_SIZE = 10;
  hasMore     = computed(() => this.jobs().length < this.totalItems());
  loadingMore = signal(false);

  private buildQuery(page: number): JobsQueryParams {
    const query: JobsQueryParams = { page, limit: this.PAGE_SIZE };

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
    if (this.filterVisibilityType()) query.visibilityType = this.filterVisibilityType() as VisibilityType;
    if (this.sortBy() && this.sortBy() !== 'newest') query.sortBy = this.sortBy() as any;
    return query;
  }

  /** Replace path — used on init, and whenever search/filter/sort changes. Always starts fresh at page 1. */
  loadJobs(page = 1): void {
    this.loading.set(true);
    this.currentPage.set(page);
    this.activeJobId.set(null);

    this.jobService.getJobs(this.buildQuery(page)).subscribe({
      next: (response: PaginatedResponse<Job>) => {
        this.jobs.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => { this.toast.error('user.jobs.toast.failedLoadJobs2'); this.loading.set(false); },
    });
  }

  /** Append path — fired by the infinite-scroll sentinel. Never used for a fresh/replace load. */
  loadMoreJobs(): void {
    if (this.loadingMore() || this.loading() || !this.hasMore()) return;
    const nextPage = this.currentPage() + 1;
    this.loadingMore.set(true);

    this.jobService.getJobs(this.buildQuery(nextPage)).subscribe({
      next: (response: PaginatedResponse<Job>) => {
        this.jobs.update(list => [...list, ...response.data]);
        this.currentPage.set(nextPage);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loadingMore.set(false);
      },
      error: () => { this.toast.error('user.jobs.toast.failedLoadMoreJobs'); this.loadingMore.set(false); },
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
      case 'visibilityType': this.filterVisibilityType.set(''); break;
    }
    this.loadJobs(1);
  }

  setVisibilityTypeFilter(v: VisibilityType | ''): void {
    this.filterVisibilityType.set(this.filterVisibilityType() === v ? '' : v);
    this.triggerFilteredLoad();
  }

  getDefaultCountry(): string {
    return this.authService.currentUser()?.country || '';
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.filterJobType.set('');
    this.filterWorkMode.set('');
    this.filterCountry.set(this.getDefaultCountry());
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
    this.filterVisibilityType.set('');
    this.filterStates.set([]);
    this.filterCities.set([]);
    this.sortBy.set('newest');
    this.loadJobs(1);
  }

  // ─── Accordion ───────────────────────────────────────────────
  toggleAccordion(id: string, event?: Event): void {
    if (event) event.stopPropagation();
    const opening = this.activeJobId() !== id;
    this.activeJobId.update(cur => cur === id ? null : id);
    if (opening) {
      // Bring the newly-expanded card's top into view — scoped to this one
      // card element only (never document.body/document.documentElement),
      // so opening a card lower on a long list doesn't require manually
      // scrolling to see its detail.
      setTimeout(() => this.scrollCardIntoView(id), 0);
    }
  }

  /**
   * Scrolls the given card to just below the app's sticky top header
   * (`.top-header`, see user-layout.component.scss) instead of flush to
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

  // ─── Add/Edit Job modal ───────────────────────────────────────
  openAddModal(): void {
    this.editJobId.set(null);
    this.showAddModal.set(true);
  }

  /** Open the modal pre-filled with an existing job for editing */
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
    } else if (job.status === 'PENDING') {
      this.loadMyPendingJobsCount();
      if (this.pageTab() === 'pending') {
        this.jobs.update(list => [job, ...list]);
        this.totalItems.update(v => v + 1);
      }
    } else {
      this.jobs.update(list => [job, ...list]);
      this.totalItems.update(v => v + 1);
    }
    if (wasEditing && job.status === 'PENDING') this.loadMyPendingJobsCount();
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
        this.toast.success('user.jobs.toast.jobDeletedSuccessfully');
        setTimeout(() => { this.closeDeleteConfirm(); this.deleting.set(false); }, CONFIRM_CLOSE_DELAY_MS);
      },
      error: () => { this.toast.error('user.jobs.toast.failedDeleteJob'); this.deleting.set(false); },
    });
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

  getLocationDisplay(job: Job): string {
    if (job.isRemote) return this.translate.instant('jobs.value.remote');
    const parts = [job.city, job.state, job.country].filter(Boolean);
    return parts.join(', ') || job.location || '';
  }

  getLocationSubtext(job: Job): string {
    if (job.isRemote) return job.country ? this.translate.instant('jobs.value.applicantsOnly', { country: job.country }) : '';
    if (job.fullAddress) return job.fullAddress;
    if (job.pincode) return this.translate.instant('jobs.value.postcode', { code: job.pincode });
    return '';
  }

  getCompanyLogoSrc(job: Job): string | null {
    return job.companyLogo ?? (job.images?.length ? job.images[0] : null);
  }

  hasDescription(job: Job): boolean {
    return !!(job.description || job.responsibilities || job.qualifications || job.requirements || job.benefits);
  }

  getFirstSkills(job: Job, max = 3): string[] {
    return (job.skills ?? []).slice(0, max);
  }

  getExtraSkillsCount(job: Job, max = 3): number {
    return Math.max(0, (job.skills?.length ?? 0) - max);
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
      .then(() => this.toast.success('user.jobs.toast.shareLinkCopied'))
      .catch(() => this.toast.error('user.jobs.toast.failedCopyShareLink'));
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

  /** Extract typed value from an input event — avoids 'as' casts in templates */
  inputVal(event: Event): string { return (event.target as HTMLInputElement).value; }
  inputNum(event: Event): number | null { const v = (event.target as HTMLInputElement).value; return v ? +v : null; }

}
