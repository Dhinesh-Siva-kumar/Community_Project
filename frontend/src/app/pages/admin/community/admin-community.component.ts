import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { CommunityService } from '../../../core/services/community.service';
import { ApiService } from '../../../core/services/api.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, CommunityAnalyticsCounts, CommunityRequest, Country, interests, PaginatedResponse } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { RadioGroupComponent, RadioOption } from '../../../shared/components/radio-group/radio-group.component';
import { ToggleComponent } from '../../../shared/components/toggle/toggle.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { CommunityRulesInputComponent } from '../../../shared/components/community-rules-input/community-rules-input.component';
import { FORM_DATA_FIELD_NAMES } from '../../../core/constants/upload.constants';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

// Remembers the last page viewed across navigations (e.g. list → detail → back).
const PAGE_STORAGE_KEY = 'admin-community:page';
// Remembers the last selected view mode (grid/table) across navigations.
const VIEW_STORAGE_KEY = 'admin-community:viewMode';

/** Every column the table view can sort by (all but Actions). */
type CommunitySortField = 'name' | 'joined' | 'category' | 'country' | 'visibility' | 'members' | 'posts' | 'status';

// ── Module-level custom validators ──────────────────────────────────────────

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

@Component({
  selector: 'app-admin-community',
  standalone: true,
  imports: [DateInputComponent, CommonModule, RouterLink, FormsModule, ReactiveFormsModule, SearchableSelectComponent, RadioGroupComponent, ToggleComponent, ImageUrlPipe, FileUploadComponent, CommunityRulesInputComponent, SortBarComponent, TranslatePipe],
  templateUrl: './admin-community.component.html',
  styleUrls: ['./admin-community.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the community list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class AdminCommunityComponent implements OnInit, OnDestroy {
  private translate = inject(TranslateService);
  private communityService = inject(CommunityService);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private layoutService = inject(LayoutService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  ngOnDestroy(): void {
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  countries: Country[] = [];
  interests: interests[] = [];
  interestOptions: SelectOption[] = [];
  countryOptions: SelectOption[] = [];

  // ── Filter dropdown options ───────────────────────────────
  filterCountryOptions:    SelectOption[] = [];
  filterCategoryOptions:   SelectOption[] = [];
  filterVisibilityOptions: SelectOption[] = [
    { value: 'global',  label: 'admin.community.label.global'  },
    { value: 'private', label: 'admin.community.label.private' },
  ];

  // ── Radio group options (app-radio-group, create/edit modal) ──
  readonly visibilityOptions: RadioOption[] = [
    { value: 'private', label: 'admin.community.label.private', icon: 'bi-lock-fill' },
    { value: 'global',  label: 'admin.community.label.global',  icon: 'bi-globe2' },
  ];

  readonly communityModeOptions: RadioOption[] = [
    { value: 'HELP_EMERGENCY', label: 'admin.community.label.helpEmergencyAssistance', icon: 'bi-life-preserver' },
    { value: 'ENQUIRE',        label: 'admin.community.label.enquire',                     icon: 'bi-question-circle-fill' },
  ];

  // ── Signals ──────────────────────────────────────────────────
  communities        = signal<Community[]>([]);
  loading            = signal(true);
  // Gates the full-page skeleton — true only until the very first fetch
  // resolves, then stays true forever after. Later fetches (stat-card
  // click, search, filter, sort) still flip `loading`, but the stats bar /
  // results meta / list stay mounted throughout instead of unmounting into
  // a skeleton and back, which read as the whole page blinking.
  pageReady          = signal(false);
  searchTerm         = signal('');
  currentPage        = signal(1);
  totalPages         = signal(1);
  totalItems         = signal(0);
  pageSize           = signal(20);
  submitting         = signal(false);
  showModal          = signal(false);
  editingCommunity   = signal<Community | null>(null);
  selectedImage      = signal<File | null>(null);
  communityToDelete  = signal<Community | null>(null);
  deletingCommunity  = signal(false);
  formSubmitAttempted = signal(false);
  showCreateFab      = signal(false);
  viewMode           = signal<'grid' | 'table'>('grid');

  private scrollTicking = false;

  // ── Filter signals ────────────────────────────────────────
  filterCountry       = signal<string | number | null>(null);
  filterCategory      = signal<string | number | null>(null);
  filterVisibility    = signal<string | number | null>(null);
  filterCommunityMode = signal<'HELP_EMERGENCY' | 'ENQUIRE' | null>(null);
  filterIsDefault     = signal<boolean | null>(null);
  filterFromDate   = signal('');
  filterToDate     = signal('');
  filterStatus     = signal<'active' | 'inactive' | ''>('');
  activeQuickRange = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters = signal(false);
  communityCounts = signal<CommunityAnalyticsCounts>({ total: 0, global: 0, private: 0, default: 0, totalMembers: 0 });

  readonly statusFilterOptions: SelectOption[] = [
    { value: '',         label: 'admin.community.label.allStatus' },
    { value: 'active',   label: 'admin.community.label.active' },
    { value: 'inactive', label: 'admin.community.label.inactive' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];

  // ── Sort — driven by the sort-bar above the grid (grid only) and by
  // clickable column headers in the table view (all columns but Actions) ──
  readonly sortFields: SortField[] = [
    { key: 'name',   label: 'admin.community.label.name' },
    { key: 'joined', label: 'admin.community.label.created' },
  ];
  sortBy  = signal<CommunitySortField>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as CommunitySortField);
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode.set(mode);
    sessionStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  /** Toggle sort for a clickable table column header — re-clicking the same column flips direction. */
  toggleSort(field: CommunitySortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('desc');
    }
    this.applyFilters();
  }

  // ── Filter chip interface ─────────────────────────────────
  readonly FilterChip = class {
    constructor(readonly key: string, readonly label: string, readonly value: any) {}
  };

  // ── Computed ─────────────────────────────────────────────────
  /** Server-side filtering: component list is whatever the API returned. */
  filteredCommunities = computed(() => this.communities());

  /** Active filter chips for display. */
  activeFilterChips = computed<any[]>(() => {
    const chips: any[] = [];
    const add = (key: string, label: string, value: any) => chips.push({ key, label, value });
    if (this.searchTerm())       add('search',    `"${this.searchTerm()}"`, this.searchTerm());
    if (this.filterCountry())    add('country',   String(this.filterCountry()), this.filterCountry());
    if (this.filterCategory())   add('category',  String(this.filterCategory()), this.filterCategory());
    if (this.filterVisibility()) add('visibility', String(this.filterVisibility()), this.filterVisibility());
    if (this.filterCommunityMode()) {
      add('communityMode', this.filterCommunityMode() === 'ENQUIRE' ? 'Enquire' : 'Help & Emergency Assistance', this.filterCommunityMode());
    }
    if (this.filterIsDefault() !== null) {
      add('isDefault', this.filterIsDefault() ? 'Default Only' : 'Non-Default', this.filterIsDefault());
    }
    if (this.filterFromDate())   add('fromDate',  this.translate.instant('admin.community.chipFrom', { date: this.filterFromDate() }), this.filterFromDate());
    if (this.filterToDate())     add('toDate',    this.translate.instant('admin.community.chipTo', { date: this.filterToDate() }), this.filterToDate());
    if (this.filterStatus())     add('status',    this.filterStatus() === 'active' ? 'Active' : 'Inactive', this.filterStatus());
    return chips;
  });

  /** Count of active filters. */
  activeFilterCount = computed(() => this.activeFilterChips().length);

  /** True when any search or filter criterion is active. */
  hasActiveFilters = computed(() => this.activeFilterCount() > 0);

  isEditing  = computed(() => !!this.editingCommunity());
  modalTitle = computed(() => (this.isEditing() ? 'Edit Community' : 'Create Community'));

  // ── Form ─────────────────────────────────────────────────────
  communityForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();
    this.restoreSavedPage();
    this.restoreSavedViewMode();
    this.loadCountries();
    this.loadInterests();
    this.loadCommunities();
  }

  /** Resume the last selected grid/table view across navigations (e.g. list → detail → back). */
  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'grid' || saved === 'table') this.viewMode.set(saved);
  }

  /**
   * Resume on the page the admin was viewing when they drilled into a community's detail page.
   * Consumed (removed) immediately so it only applies to that one return trip — navigating away
   * to an unrelated section and back starts fresh on page 1.
   */
  private restoreSavedPage(): void {
    const saved = Number(sessionStorage.getItem(PAGE_STORAGE_KEY));
    sessionStorage.removeItem(PAGE_STORAGE_KEY);
    if (saved > 0) this.currentPage.set(saved);
  }

  /** Reveals the floating create button once the page header has scrolled out of view. */
  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.showCreateFab.set(window.scrollY >= 120);
      this.scrollTicking = false;
    });
  }

  initForm(): void {
    this.communityForm = this.fb.group({
      communityName: [
        '',
        [Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(150)],
      ],
      interests:   [null, Validators.required],
      description: ['', [Validators.required, noWhitespace, Validators.maxLength(500)]],
      image:       [null],
      visibility:  [''],
      isDefault:   [false],
      countryId:   [null, Validators.required],
      communityMode: ['HELP_EMERGENCY', Validators.required],
      rules:       [[] as string[]],
    });
  }

  get f() {
    return this.communityForm.controls;
  }

  // ── Data loading ─────────────────────────────────────────────
  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.countries = res.data;
        this.countryOptions = this.countries.map((c) => {
          const flag =
            c.flag_emoji ||
            [...c.iso2.toUpperCase()]
              .map((ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)))
              .join('');
          return { value: c.id, label: `${flag} ${c.name}` };
        });
        this.filterCountryOptions = this.countries.map((c) => {
          const flag =
            c.flag_emoji ||
            [...c.iso2.toUpperCase()]
              .map((ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)))
              .join('');
          return { value: c.name, label: `${flag} ${c.name}` };
        });
        // Pre-select India as default for new communities.
        const defaultCountry = this.countries.find((c) => c.name === 'India');
        if (defaultCountry) {
          this.communityForm.patchValue({ countryId: defaultCountry.id });
        }
      },
      error: () => this.toastService.error('admin.community.toast.failedLoadCountries'),
    });
  }

  loadInterests(): void {
    this.authService.getInterests().subscribe({
      next: (res) => {
        this.interests = res.data;
        this.interestOptions = this.interests.map((i) => ({
          value: i.interest_id,
          label: i.interest_name,
        }));
        this.filterCategoryOptions = this.interests.map((i) => ({
          value: i.interest_name,
          label: i.interest_name,
        }));
      },
      error: () => this.toastService.error('admin.community.toast.failedLoadInterests'),
    });
  }

  /**
   * `silent` skips the loading-skeleton flip — used when refreshing the list
   * after a create/edit/delete whose modal already closed over an
   * unchanged scroll position. Toggling `loading` there would unmount the
   * whole grid/table behind it and collapse the page height, snapping the
   * scroll back to the top (the modal-popup equivalent of the scroll-lock
   * bug, just triggered by the post-save refetch instead of the open).
   */
  loadCommunities(silent = false): void {
    if (!silent) this.loading.set(true);
    const params: Record<string, any> = {
      user_id: this.authService.currentUser()?.id ?? 39,
      page: this.currentPage(),
      limit: this.pageSize(),
      // Rejected communities belong on the Approval page's Community tab,
      // not this management list.
      excludeRejected: true,
    };
    // Only append filter params when they carry a non-empty value.
    if (this.searchTerm())       params['search']     = this.searchTerm();
    if (this.filterCountry())    params['country']    = String(this.filterCountry());
    if (this.filterCategory())   params['category']   = String(this.filterCategory());
    if (this.filterVisibility()) params['visibility'] = String(this.filterVisibility());
    if (this.filterCommunityMode()) params['community_mode'] = this.filterCommunityMode();
    if (this.filterIsDefault() !== null) params['is_default'] = String(this.filterIsDefault());
    if (this.filterFromDate())   params['from_date']  = this.filterFromDate();
    if (this.filterToDate())     params['to_date']    = this.filterToDate();
    if (this.filterStatus())     params['status']     = this.filterStatus();
    params['sortBy']  = this.sortBy();
    params['sortDir'] = this.sortDir();

    this.loadCommunityAnalytics();

    this.communityService.getCommunities(params).subscribe({
      next: (response: PaginatedResponse<Community>) => {
        // The saved page may no longer exist (e.g. communities were deleted/filtered out) — fall back to the last valid page.
        if (response.totalPages > 0 && this.currentPage() > response.totalPages) {
          this.currentPage.set(response.totalPages);
          this.loadCommunities(silent);
          return;
        }
        this.communities.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        if (!silent) this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => {
        this.toast.error('admin.community.toast.failedLoadCommunities');
        if (!silent) this.loading.set(false);
        this.pageReady.set(true);
      },
    });
  }

  loadCommunityAnalytics(): void {
    this.communityService.getCommunityAnalytics().subscribe({
      next: (counts) => this.communityCounts.set(counts),
      error: () => {
        this.communityCounts.set({ total: 0, global: 0, private: 0, default: 0, totalMembers: 0 });
      },
    });
  }

  // ── Search / pagination ───────────────────────────────────────
  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onFilterFromDateChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterFromDate.set(value);
    this.applyFilters();
  }

  onFilterToDateChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterToDate.set(value);
    this.applyFilters();
  }

  applyQuickDatePreset(preset: 'today' | '7d' | '30d'): void {
    const today = new Date();
    const to = this.toInputDate(today);

    if (preset === 'today') {
      this.filterFromDate.set(to);
      this.filterToDate.set(to);
      this.activeQuickRange.set('today');
      this.applyFilters();
      return;
    }

    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - (preset === '7d' ? 6 : 29));
    this.filterFromDate.set(this.toInputDate(fromDate));
    this.filterToDate.set(to);
    this.activeQuickRange.set(preset);
    this.applyFilters();
  }

  onFilterCountryChange(value: any): void {
    this.filterCountry.set(value);
    this.applyFilters();
  }

  onFilterCategoryChange(value: any): void {
    this.filterCategory.set(value);
    this.applyFilters();
  }

  onFilterVisibilityChange(value: any): void {
    this.filterVisibility.set(value);
    this.applyFilters();
  }

  /** The four stat cards (Total/Global/Private/Default) all drive this one
   * derived value, so exactly one is ever selected at a time — each setter
   * clears the other axis (visibility vs. default) so they can't both be
   * active simultaneously. */
  communityStatFilter = computed<'all' | 'global' | 'private' | 'default'>(() => {
    if (this.filterIsDefault() === true) return 'default';
    if (this.filterVisibility() === 'global') return 'global';
    if (this.filterVisibility() === 'private') return 'private';
    return 'all';
  });

  /** Toggles off back to 'all' on a repeat click of the same card. */
  setCommunityStatFilter(value: 'all' | 'global' | 'private' | 'default'): void {
    const next = this.communityStatFilter() === value ? 'all' : value;
    this.filterVisibility.set(next === 'global' ? 'global' : next === 'private' ? 'private' : null);
    this.filterIsDefault.set(next === 'default' ? true : null);
    this.applyFilters();
  }

  onFilterCommunityModeChange(mode: 'HELP_EMERGENCY' | 'ENQUIRE' | null): void {
    this.filterCommunityMode.set(mode);
    this.applyFilters();
  }

  onFilterIsDefaultChange(value: boolean | null): void {
    this.filterIsDefault.set(value);
    this.applyFilters();
  }

  /** Apply all active filters — resets to page 1 and fires the API call. */
  applyFilters(): void {
    this.currentPage.set(1);
    this.loadCommunities();
  }

  /** Reset every filter signal to empty and reload the unfiltered list. */
  clearFilters(): void {
    this.searchTerm.set('');
    this.filterCountry.set(null);
    this.filterCategory.set(null);
    this.filterVisibility.set(null);
    this.filterCommunityMode.set(null);
    this.filterIsDefault.set(null);
    this.filterFromDate.set('');
    this.filterToDate.set('');
    this.filterStatus.set('');
    this.activeQuickRange.set(null);
    this.currentPage.set(1);
    this.loadCommunities();
  }

  setStatusFilter(value: string | number): void {
    this.filterStatus.set(value as 'active' | 'inactive' | '');
    this.applyFilters();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadCommunities();
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

  /** Remove a single filter chip. */
  removeFilter(key: string): void {
    switch (key) {
      case 'search':     this.searchTerm.set('');        break;
      case 'country':    this.filterCountry.set(null);   break;
      case 'category':   this.filterCategory.set(null);  break;
      case 'visibility': this.filterVisibility.set(null); break;
      case 'communityMode': this.filterCommunityMode.set(null); break;
      case 'isDefault':  this.filterIsDefault.set(null);  break;
      case 'fromDate':   this.filterFromDate.set('');    break;
      case 'toDate':     this.filterToDate.set('');      break;
      case 'status':     this.filterStatus.set('');      break;
    }
    if (key === 'fromDate' || key === 'toDate') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadCommunities();
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

  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }

  // ── Modal open / close ────────────────────────────────────────
  openCreateModal(): void {
    this.editingCommunity.set(null);
    this.communityForm.reset();
    this.formSubmitAttempted.set(false);

    // Re-apply defaults that reset() clears.
    const patches: Record<string, unknown> = {};
    const defaultInterest = this.interests.find((i) => i.interest_name === 'Jobs');
    if (defaultInterest) patches['interests'] = defaultInterest.interest_id;
    const defaultCountry = this.countries.find((c) => c.name === 'India');
    if (defaultCountry) patches['countryId'] = defaultCountry.id;
    patches['communityMode'] = 'HELP_EMERGENCY';
    patches['rules'] = [];
    if (Object.keys(patches).length) this.communityForm.patchValue(patches);

    this.selectedImage.set(null);
    this.showModal.set(true);
  }

  openEditModal(community: Community): void {
    this.editingCommunity.set(community);
    this.formSubmitAttempted.set(false);
    const c = community as any;
    this.communityForm.patchValue({
      communityName: community.name,
      description:   community.description ?? '',
      interests:     c['interest_id'] ?? null,
      countryId:     c['country_id'] ?? null,
      visibility:    c['is_private'] ? 'private' : c['is_global'] ? 'global' : '',
      isDefault:     c['is_default'] ?? false,
      communityMode: c['community_mode'] ?? 'HELP_EMERGENCY',
      rules:         c['rules'] ?? [],
    });
    this.selectedImage.set(null);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingCommunity.set(null);
    this.communityForm.reset();
    this.formSubmitAttempted.set(false);
    this.selectedImage.set(null);
  }

  // ── Image handling ────────────────────────────────────────────
  onCommunityImageChange(files: File[]): void {
    this.selectedImage.set(files[0] ?? null);
  }

  // ── Form submission ───────────────────────────────────────────
  submitForm(): void {
    this.formSubmitAttempted.set(true);
    this.communityForm.markAllAsTouched();

    const formData = this.communityForm.value;

    // Image required on create.
    const imageValid = this.isEditing() || !!this.selectedImage();
    // At least one of Private / Global required on create.
    const visibilityValid = this.isEditing() || !!formData.visibility;

    if (this.communityForm.invalid || !imageValid || !visibilityValid) {
      this.scrollToFirstError();
      return;
    }

    this.submitting.set(true);
    const file = this.selectedImage();

     // Upload image first (if a new file was chosen), then create/update.
     const upload$: Observable<{ path: string } | null> = file
       ? this.apiService.postWithFile<{ path: string }>('/upload', { folder: 'communities' }, [{ field: FORM_DATA_FIELD_NAMES.FILE, file }])
       : of(null);

    upload$
      .pipe(
        switchMap((uploadResult: { path: string } | null) => {
          const payload = this.mapToPayload(formData, uploadResult?.path ?? null);
          return this.isEditing()
            ? this.communityService.updateCommunity(this.editingCommunity()!.id, payload)
            : this.communityService.createCommunity(payload);
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(
            this.isEditing() ? 'Community updated successfully' : 'Community created successfully',
          );
          this.closeModal();
          this.loadCommunities(true);
          this.submitting.set(false);
        },
        error: () => {
          this.toast.error(
            this.isEditing() ? 'Failed to update community' : 'Failed to create community',
          );
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

  // ── Delete ────────────────────────────────────────────────────
  confirmDelete(community: Community): void {
    this.communityToDelete.set(community);
  }

  cancelDelete(): void {
    this.communityToDelete.set(null);
  }

  deleteCommunity(): void {
    const community = this.communityToDelete();
    if (!community) return;
    this.deletingCommunity.set(true);
    this.communityService.deleteCommunity(community.id).subscribe({
      next: () => {
        this.toast.success('admin.community.toast.communityDeletedSuccessfully');
        this.communityToDelete.set(null);
        this.deletingCommunity.set(false);
        this.loadCommunities(true);
      },
      error: () => {
        this.toast.error('admin.community.toast.failedDeleteCommunity');
        this.deletingCommunity.set(false);
      },
    });
  }

  // ── Display helpers ───────────────────────────────────────────
  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getVisibility(community: Community): 'Private' | 'Global' | 'Default' | null {
    if (community.is_private) return this.translate.instant('admin.community.visibilityPrivate');
    if (community.is_global)  return this.translate.instant('admin.community.visibilityGlobal');
    if (community.is_default) return this.translate.instant('admin.community.visibilityDefault');
    return null;
  }

  truncate(text: string | undefined, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  viewCommunity(communityId: string): void {
    // Remembered only for this drill-down — restoreSavedPage() consumes it on return.
    sessionStorage.setItem(PAGE_STORAGE_KEY, String(this.currentPage()));
    this.router.navigate(['/admin/community', communityId]);
  }

  private toInputDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Payload builder ───────────────────────────────────────────
  private mapToPayload(form: any, newImageUrl: string | null): CommunityRequest {
    const selectedCountry = this.countries.find((c) => c.id === form.countryId);

    // Resolution order: fresh upload > existing image (edit) > undefined.
    let image: string | undefined;
    if (newImageUrl) {
      image = newImageUrl;
    } else if (this.isEditing() && !this.selectedImage()) {
      image = this.editingCommunity()?.image ?? undefined;
    }

    return {
      name:        form.communityName,
      description: form.description || undefined,
      image,
      interest_id: form.interests   || undefined,
      country:     selectedCountry?.name,
      country_id:  form.countryId   || undefined,
      is_private:  form.visibility === 'private',
      is_global:   form.visibility === 'global',
      is_default:  form.isDefault   ?? false,
      community_mode: form.communityMode ?? 'HELP_EMERGENCY',
      rules:       form.rules ?? [],
    };
  }
}
