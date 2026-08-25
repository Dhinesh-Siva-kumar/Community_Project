import { Component, OnInit, OnDestroy, effect, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { CommunityService } from '../../../core/services/community.service';
import { JobService } from '../../../core/services/job.service';
import { PostService } from '../../../core/services/post.service';
import { EventService } from '../../../core/services/event.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { User, Business, Community, Job, Post, Event as CommunityEvent, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ProfileHeaderComponent } from '../../../shared/components/profile-header/profile-header.component';
import { ProfileTabsComponent, ProfileTab } from '../../../shared/components/profile-tabs/profile-tabs.component';
import { ProfileInfoCardComponent } from '../../../shared/components/profile-info-card/profile-info-card.component';
import { ProfileProgressComponent } from '../../../shared/components/profile-progress/profile-progress.component';
import { BusinessFormModalComponent } from '../../../shared/components/business-form-modal/business-form-modal.component';
import { BusinessDeleteModalComponent } from '../../../shared/components/business-delete-modal/business-delete-modal.component';
import { CommunityFormModalComponent } from '../../../shared/components/community-form-modal/community-form-modal.component';
import { CommunityDeleteModalComponent } from '../../../shared/components/community-delete-modal/community-delete-modal.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { EnumLabelPipe } from '../../../shared/pipes/enum-label.pipe';

/** Country-aware postal code validator — mirrors business-form-modal.component.ts's. */
function postalCodeValidator(regex: string | null): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v || !regex) return null;
    try { return new RegExp(regex).test(v) ? null : { postalFormat: true }; }
    catch { return null; }
  };
}

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, DatePipe,
    SearchableSelectComponent,
    ProfileHeaderComponent, ProfileTabsComponent, ProfileInfoCardComponent, ProfileProgressComponent,
    BusinessFormModalComponent, BusinessDeleteModalComponent,
    CommunityFormModalComponent, CommunityDeleteModalComponent,
    ImageUrlPipe, TranslatePipe, EnumLabelPipe],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class UserProfileComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private communityService = inject(CommunityService);
  private jobService = inject(JobService);
  private postService = inject(PostService);
  private eventService = inject(EventService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private geographyService = inject(GeographyService);

  user = signal<User | null>(null);
  loading = signal(true);
  saving = signal(false);
  activeTab = signal('personal');
  editMode = signal(false);

  myBusinesses = signal<Business[]>([]);
  showBusinessModal = signal(false);
  editBusinessId    = signal<string | null>(null);
  myCommunities = signal<Community[]>([]);
  showCommunityModal = signal(false);
  editCommunityId    = signal<string | null>(null);
  myJobs = signal<Job[]>([]);
  myPosts = signal<Post[]>([]);
  myEvents = signal<CommunityEvent[]>([]);
  loadingBusinesses = signal(false);
  loadingCommunities = signal(false);
  loadingJobs = signal(false);
  loadingPosts = signal(false);
  loadingEvents = signal(false);
  showDeleteBusinessModal = signal(false);
  businessToDelete = signal<Business | null>(null);
  showDeleteCommunityModal = signal(false);
  communityToDelete = signal<Community | null>(null);
  deletingJobId = signal<string | null>(null);
  deletingPostId = signal<string | null>(null);
  deletingEventId = signal<string | null>(null);

  avatarFile = signal<File | null>(null);
  newInterest = signal('');

  // ── Country-aware address hierarchy (Country → State/District → City) ──
  // Mirrors business-form-modal.component.ts's implementation — same
  // GeographyService, same signals/handler names.
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
    const countryId = this.profileForm.get('countryId')?.value ? Number(this.profileForm.get('countryId')?.value) : undefined;
    const divisionId = this.getLeafDivisionId() ?? undefined;
    if (!countryId) return of([]);
    return this.geographyService.searchCities({ divisionId, countryId: divisionId ? undefined : countryId, search: query, page: 1, limit: 20 }).pipe(
      map(res => {
        res.data.forEach(c => this.cityNameCache.set(c.id, c.name));
        return res.data.map(c => ({ value: c.id, label: c.name }));
      }),
    );
  };

  profileForm!: FormGroup;
  passwordForm!: FormGroup;

  /** Mirrors profileForm's occupationType control — drives which field group (Professional vs Student) the template renders. */
  occupationType = signal<'PROFESSIONAL' | 'STUDENT'>('PROFESSIONAL');
  showPasswordSection = signal(false);
  changingPassword = signal(false);

  profileCompletion = computed(() => this.user()?.profileCompletion ?? 0);

  completionRingClass = computed(() => {
    const pct = this.profileCompletion();
    if (pct >= 100) return 'ring--complete';
    if (pct >= 80) return 'ring--great';
    if (pct >= 60) return 'ring--good';
    if (pct >= 40) return 'ring--fair';
    if (pct >= 20) return 'ring--low';
    return 'ring--start';
  });

  /** Hex twin of completionRingClass()'s bands — feeds the conic-gradient
   * progress ring's --ring-clr custom property (a CSS custom property can't
   * resolve a SCSS variable, so the same stepped scale is duplicated here
   * as literal hex from _colors.scss). */
  completionRingColor = computed(() => {
    const pct = this.profileCompletion();
    if (pct >= 100) return '#16A34A'; // $color-success
    if (pct >= 80)  return '#059669'; // $color-emerald-600
    if (pct >= 60)  return '#0EA5E9'; // $color-info
    if (pct >= 40)  return '#D97706'; // $color-primary-darker
    if (pct >= 20)  return '#D97706'; // $color-warning
    return '#DC2626';                 // $color-danger
  });

  completionItems = computed(() => {
    const u = this.user();
    if (!u) return [];
    return [
      { label: 'user.profile.checklist.username',    done: !!u.userName },
      { label: 'user.profile.checklist.displayName', done: !!u.displayName },
      { label: 'user.profile.checklist.email',       done: !!u.email },
      { label: 'user.profile.checklist.phone',       done: !!u.phoneNo },
      { label: 'user.profile.checklist.photo',       done: !!u.avatar },
      { label: 'user.profile.checklist.bio',         done: !!u.bio },
      { label: 'user.profile.checklist.location',    done: !!u.location },
      { label: 'user.profile.checklist.pincode',     done: !!u.pincode },
      { label: 'user.profile.checklist.interests',   done: u.interests.length > 0 },
      { label: 'user.profile.checklist.category',    done: !!u.professionalCategory },
    ];
  });

  completedItems = computed(() => this.completionItems().filter(i => i.done));
  pendingItems    = computed(() => this.completionItems().filter(i => !i.done));

  postStatusCounts = computed(() => {
    const posts = this.myPosts();
    return {
      pending:  posts.filter(p => p.status === 'PENDING').length,
      approved: posts.filter(p => p.status === 'APPROVED').length,
      rejected: posts.filter(p => p.status === 'REJECTED').length,
    };
  });

  // Per-tab accent (icon-chip fill + sliding indicator tint) — reuses the
  // exact same colors as the User Dashboard's activity stat tiles
  // (user-dashboard.component.ts's animatedStats) so a given feature reads
  // as the same color everywhere in the app. Personal Info has no
  // dashboard equivalent, so it's left to fall back to the tab bar's
  // default brand amber.
  tabs: ProfileTab[] = [
    { id: 'personal',    label: 'user.profile.tab.personal',   icon: 'bi-person' },
    { id: 'communities', label: 'user.profile.tab.communities',  icon: 'bi-people',         color: '#16A34A', bgColor: '#DCFCE7' },
    { id: 'businesses',  label: 'user.profile.tab.businesses',   icon: 'bi-shop',           color: '#2563EB', bgColor: '#DBEAFE' },
    { id: 'jobs',        label: 'user.profile.tab.jobs',          icon: 'bi-briefcase',     color: '#0D9488', bgColor: '#CCFBF1' },
    { id: 'posts',       label: 'user.profile.tab.posts',         icon: 'bi-file-post',     color: '#F59E0B', bgColor: '#FEF3C7' },
    { id: 'events',      label: 'user.profile.tab.events',        icon: 'bi-calendar-event', color: '#7C3AED', bgColor: '#EDE9FE' },
  ];

  profCatOptions: SelectOption[] = [
    'Technology', 'Healthcare', 'Education', 'Finance', 'Legal',
    'Marketing', 'Design', 'Engineering', 'Sales', 'Construction',
    'Hospitality', 'Retail', 'Real Estate', 'Other',
  ].map(c => ({ value: c, label: c }));

  occupationTypeOptions: SelectOption[] = [
    { value: 'PROFESSIONAL', label: 'user.profile.occupationOption.professional' },
    { value: 'STUDENT',      label: 'user.profile.occupationOption.student' },
  ];

  constructor() {
    // Lock background scroll while any popup on this page is open — the
    // Business/Community add & delete modals, and the Change Password
    // popup.
    effect(() => {
      const open = this.showBusinessModal() || this.showDeleteBusinessModal()
        || this.showCommunityModal() || this.showDeleteCommunityModal()
        || this.showPasswordSection();
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
      email: ['', [Validators.email]],
      phoneNo: ['', [Validators.maxLength(20)]],
      whatsappNo: ['', [Validators.maxLength(20)]],
      bio: ['', [Validators.maxLength(300)]],
      countryId: [null],
      division1Id: [null],
      division2Id: [null],
      cityId: [null],
      pincode: ['', [Validators.maxLength(12)]],
      professionalCategory: ['', [Validators.maxLength(60)]],
      occupation: ['', [Validators.maxLength(100)]],
      company: ['', [Validators.maxLength(100)]],
      website: ['', [Validators.maxLength(200)]],
      linkedinUrl: ['', [Validators.maxLength(200)]],
      occupationType: ['PROFESSIONAL'],
      institution: ['', [Validators.maxLength(150)]],
      course: ['', [Validators.maxLength(150)]],
      graduationYear: ['', [Validators.min(1950), Validators.max(2100)]],
    });

    this.profileForm.get('occupationType')?.valueChanges.subscribe((value) => {
      this.occupationType.set(value === 'STUDENT' ? 'STUDENT' : 'PROFESSIONAL');
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    });

    this.loadGeoCountriesIfNeeded();
    this.loadProfile();

    // Deep-link support — e.g. the dashboard's "Posts" activity stat links
    // here with ?tab=posts to preselect the matching tab.
    const requestedTab = this.route.snapshot.queryParams['tab'];
    if (requestedTab && this.tabs.some(t => t.id === requestedTab)) {
      this.setTab(requestedTab);
    }
  }

  loadProfile(): void {
    this.loading.set(true);
    this.userService.getProfile().subscribe({
      next: (user) => { this.user.set(user); this.patchForm(user); this.loading.set(false); },
      error: () => {
        const u = this.authService.currentUser();
        if (u) { this.user.set(u); this.patchForm(u); }
        this.loading.set(false);
      },
    });
  }

  private patchForm(u: User): void {
    this.profileForm.patchValue({
      displayName: u.displayName,
      email: u.email,
      phoneNo: u.phoneNo || '',
      whatsappNo: u.whatsappNo || '',
      bio: u.bio || '',
      pincode: u.pincode || '',
      professionalCategory: u.professionalCategory || '',
      occupation: u.occupation || '',
      company: u.company || '',
      website: u.website || '',
      linkedinUrl: u.linkedinUrl || '',
      occupationType: u.occupationType || 'PROFESSIONAL',
      institution: u.institution || '',
      course: u.course || '',
      graduationYear: u.graduationYear ?? '',
    });
    this.patchLocation(u);
  }

  private loadGeoCountriesIfNeeded(): void {
    if (this.geoCountries().length) return;
    this.geographyService.getCountries().subscribe({
      next: data => this.geoCountries.set(data),
      error: () => {},
    });
  }

  /**
   * Restores the Country/State/City dropdowns from the stored ids alone
   * (countryId/cityId + stateChain, all returned by getProfile()) — mirrors
   * business-form-modal.component.ts's applyEditFormData(). Every setValue()
   * below is silent so it doesn't re-fire onDivision1Change() (which, for
   * real user input, correctly clears division2Id/cityId as a side effect —
   * that would wipe out the City field this same function just set).
   */
  private patchLocation(u: User): void {
    const silent = { emitEvent: false, emitViewToModelChange: false };
    this.resetDivisionState();
    const countryId = u.countryId ?? null;
    if (countryId) {
      this.profileForm.get('countryId')?.setValue(countryId, silent);
      this.geographyService.getCountryConfig(countryId).subscribe({
        next: (config) => {
          this.countryConfig.set(config);
          this.applyPincodeValidators();
          if (config.divisionLevels.length === 0) return;

          const chain = u.stateChain ?? [];
          this.division1Loading.set(true);
          this.geographyService.getDivisions(countryId).subscribe({
            next: (divisions) => {
              this.division1Options.set(divisions);
              this.division1Loading.set(false);
              const lvl1 = chain[0];
              if (!lvl1) return;
              this.profileForm.get('division1Id')?.setValue(lvl1.id, silent);
              this.selectedDivision1Name.set(lvl1.name);
              if (config.divisionLevels.length < 2) return;

              this.division2Loading.set(true);
              this.geographyService.getDivisions(countryId, lvl1.id).subscribe({
                next: (divisions2) => {
                  this.division2Options.set(divisions2);
                  this.division2Loading.set(false);
                  const lvl2 = chain[1];
                  if (!lvl2) return;
                  this.profileForm.get('division2Id')?.setValue(lvl2.id, silent);
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
      this.applyPincodeValidators();
    }

    const cityId = u.cityId ?? null;
    if (cityId) {
      const cityName = u.location ?? null;
      this.profileForm.get('cityId')?.setValue(cityId, silent);
      this.selectedCityName.set(cityName);
      this.selectedCityOption.set({ value: cityId, label: cityName ?? '' });
      if (cityName) this.cityNameCache.set(cityId, cityName);
    }
  }

  private getLeafDivisionId(): number | null {
    const levels = this.adminLevels().length;
    if (levels >= 2) { const v = this.profileForm.get('division2Id')?.value; return v ? Number(v) : null; }
    if (levels === 1) { const v = this.profileForm.get('division1Id')?.value; return v ? Number(v) : null; }
    return null;
  }

  private applyPincodeValidators(): void {
    const postal = this.countryConfig()?.postalCode;
    const validators: ValidatorFn[] = [Validators.maxLength(12), postalCodeValidator(postal?.regex ?? null)];
    const ctrl = this.profileForm.get('pincode');
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
    this.profileForm.get('division1Id')?.setValue(null, silent);
    this.profileForm.get('division2Id')?.setValue(null, silent);
    this.profileForm.get('cityId')?.setValue(null, silent);
  }

  onCountryChange(countryId: any): void {
    this.resetDivisionState();
    const id = countryId ? Number(countryId) : null;
    if (!id) { this.applyPincodeValidators(); return; }

    this.geographyService.getCountryConfig(id).subscribe({
      next: (config) => {
        this.countryConfig.set(config);
        this.applyPincodeValidators();
        if (config.divisionLevels.length > 0) {
          this.division1Loading.set(true);
          this.geographyService.getDivisions(id).subscribe({
            next: divisions => { this.division1Options.set(divisions); this.division1Loading.set(false); },
            error: () => this.division1Loading.set(false),
          });
        }
      },
      error: () => this.toast.error('user.profile.toast.failedLoadCountryAddressDetails'),
    });
  }

  onDivision1Change(divisionId: any): void {
    this.profileForm.get('division2Id')?.setValue(null);
    this.profileForm.get('cityId')?.setValue(null);
    this.division2Options.set([]);
    this.selectedDivision2Name.set(null);
    this.selectedCityOption.set(null);
    this.selectedCityName.set(null);

    const id = divisionId ? Number(divisionId) : null;
    this.selectedDivision1Name.set(id ? (this.division1Options().find(d => d.id === id)?.name ?? null) : null);

    const countryId = this.profileForm.get('countryId')?.value ? Number(this.profileForm.get('countryId')?.value) : null;
    if (id && countryId && this.adminLevels().length >= 2) {
      this.division2Loading.set(true);
      this.geographyService.getDivisions(countryId, id).subscribe({
        next: divisions => { this.division2Options.set(divisions); this.division2Loading.set(false); },
        error: () => this.division2Loading.set(false),
      });
    }
  }

  onDivision2Change(divisionId: any): void {
    this.profileForm.get('cityId')?.setValue(null);
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

  setTab(id: string): void {
    this.activeTab.set(id);
    if (id === 'businesses'  && !this.myBusinesses().length)  this.loadMyBusinesses();
    if (id === 'communities' && !this.myCommunities().length) this.loadMyCommunities();
    if (id === 'jobs'        && !this.myJobs().length)        this.loadMyJobs();
    if (id === 'posts'       && !this.myPosts().length)       this.loadMyPosts();
    if (id === 'events'      && !this.myEvents().length)      this.loadMyEvents();
  }

  // ── Row-click navigation — Businesses/Communities/Jobs/Events rows jump
  // to that item's own detail view rather than doing anything inline here. ──

  /** Communities have a real detail route. */
  goToCommunity(id: string): void {
    this.router.navigate(['/user/community', id]);
  }

  /** Businesses have no standalone route — the list page's own "detail"
   * is an in-page view switch, opened via a ?businessId= deep link it
   * already knows how to consume. */
  goToBusiness(id: string): void {
    this.router.navigate(['/user/business'], { queryParams: { businessId: id } });
  }

  /** Jobs have no standalone route either — the list page expands the
   * matching card's own inline detail accordion via a ?jobId= deep link. */
  goToJob(id: string): void {
    this.router.navigate(['/user/jobs'], { queryParams: { jobId: id } });
  }

  /** Events list everything inline — the list page scrolls to and briefly
   * highlights the matching card via the ?eventId= deep link it already
   * supports (e.g. from the dashboard calendar). */
  goToEvent(id: string): void {
    this.router.navigate(['/user/events'], { queryParams: { eventId: id } });
  }

  /** "Add Job"/"Add Event" — Jobs and Events don't have their own add
   * forms here (they're sizeable, page-specific forms), so these hand off
   * to the respective list page's own Add modal via a ?openAdd=1 deep
   * link it already knows how to consume. */
  goToAddJob(): void {
    this.router.navigate(['/user/jobs'], { queryParams: { openAdd: 1 } });
  }

  goToAddEvent(): void {
    this.router.navigate(['/user/events'], { queryParams: { openAdd: 1 } });
  }

  toggleEdit(): void {
    this.editMode.update(v => !v);
    if (!this.editMode()) { const u = this.user(); if (u) this.patchForm(u); }
  }

  cancelEdit(): void { this.editMode.set(false); const u = this.user(); if (u) this.patchForm(u); }

  onAvatarChange(files: File[]): void { this.avatarFile.set(files[0] ?? null); }

  addInterest(): void {
    const val = this.newInterest().trim();
    if (!val) return;
    this.user.update(u => u ? { ...u, interests: [...u.interests, val] } : u);
    this.newInterest.set('');
  }

  removeInterest(i: number): void {
    this.user.update(u => u ? { ...u, interests: u.interests.filter((_, idx) => idx !== i) } : u);
  }

  onInterestInput(e: Event): void { this.newInterest.set((e.target as HTMLInputElement).value); }
  onInterestKeydown(e: KeyboardEvent): void { if (e.key === 'Enter') { e.preventDefault(); this.addInterest(); } }

  saveProfile(): void {
    if (this.profileForm.invalid) return;
    this.saving.set(true);
    const data: Record<string, any> = { ...this.profileForm.getRawValue(), interests: this.user()?.interests ?? [] };
    if (this.user()?.email || !data['email']) delete data['email'];

    // division1Id/division2Id are UI-only — the backend only wants the
    // resolved leaf division as stateId (mirrors business-form-modal's
    // submitBusiness()). Country/state/city are optional here, so omit
    // rather than send null (the DTO's fields are optional, not nullable).
    data['stateId'] = this.getLeafDivisionId() ?? undefined;
    delete data['division1Id'];
    delete data['division2Id'];
    (['countryId', 'stateId', 'cityId'] as const).forEach((k) => {
      if (data[k] === null || data[k] === undefined) delete data[k];
    });

    this.userService.updateProfile(data, this.avatarFile() ?? undefined).subscribe({
      next: (user) => {
        this.user.set(user); this.authService.currentUser.set(user);
        this.editMode.set(false); this.avatarFile.set(null);
        this.toast.success('user.profile.toast.profileUpdatedSuccessfully'); this.saving.set(false);
      },
      error: () => { this.toast.error('user.profile.toast.failedUpdateProfile'); this.saving.set(false); },
    });
  }

  togglePasswordSection(): void { this.showPasswordSection.update(v => !v); this.passwordForm.reset(); }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    const { newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) { this.toast.error('user.profile.toast.passwordsDoNotMatch'); return; }
    this.changingPassword.set(true);
    this.userService.updateProfile({ password: newPassword }).subscribe({
      next: () => { this.toast.success('user.profile.toast.passwordChangedSuccessfully'); this.showPasswordSection.set(false); this.passwordForm.reset(); this.changingPassword.set(false); },
      error: () => { this.toast.error('user.profile.toast.failedChangePassword'); this.changingPassword.set(false); },
    });
  }

  loadMyBusinesses(): void {
    this.loadingBusinesses.set(true);
    this.businessService.getMyBusinesses({ page: 1, limit: 50 }).subscribe({
      next: (r) => { this.myBusinesses.set(r.data); this.loadingBusinesses.set(false); },
      error: () => this.loadingBusinesses.set(false),
    });
  }

  openDeleteBusiness(biz: Business): void {
    this.businessToDelete.set(biz);
    this.showDeleteBusinessModal.set(true);
  }

  closeDeleteBusinessModal(): void {
    this.showDeleteBusinessModal.set(false);
    this.businessToDelete.set(null);
  }

  onBusinessDeleted(id: string): void {
    this.myBusinesses.update(l => l.filter(b => b.id !== id));
  }

  openAddBusiness(): void {
    this.editBusinessId.set(null);
    this.showBusinessModal.set(true);
  }

  openEditBusiness(id: string): void {
    this.editBusinessId.set(id);
    this.showBusinessModal.set(true);
  }

  closeBusinessModal(): void {
    this.showBusinessModal.set(false);
    this.editBusinessId.set(null);
  }

  onBusinessSaved(biz: Business): void {
    const exists = this.myBusinesses().some(b => b.id === biz.id);
    this.myBusinesses.update(list => exists ? list.map(b => b.id === biz.id ? biz : b) : [biz, ...list]);
  }

  loadMyCommunities(): void {
    this.loadingCommunities.set(true);
    this.communityService.getMyCreatedCommunities({ page: 1, limit: 50 }).subscribe({
      next: (r) => { this.myCommunities.set(r.data); this.loadingCommunities.set(false); },
      error: () => this.loadingCommunities.set(false),
    });
  }

  openDeleteCommunity(community: Community): void {
    this.communityToDelete.set(community);
    this.showDeleteCommunityModal.set(true);
  }

  closeDeleteCommunityModal(): void {
    this.showDeleteCommunityModal.set(false);
    this.communityToDelete.set(null);
  }

  onCommunityDeleted(id: string): void {
    this.myCommunities.update(l => l.filter(c => c.id !== id));
  }

  openAddCommunity(): void {
    this.editCommunityId.set(null);
    this.showCommunityModal.set(true);
  }

  openEditCommunity(id: string): void {
    this.editCommunityId.set(id);
    this.showCommunityModal.set(true);
  }

  closeCommunityModal(): void {
    this.showCommunityModal.set(false);
    this.editCommunityId.set(null);
  }

  onCommunitySaved(community: Community): void {
    const exists = this.myCommunities().some(c => c.id === community.id);
    this.myCommunities.update(list => exists ? list.map(c => c.id === community.id ? community : c) : [community, ...list]);
  }

  loadMyJobs(): void {
    this.loadingJobs.set(true);
    this.jobService.getJobs().subscribe({
      next: (r) => { this.myJobs.set(r.data.filter(j => j.userId === this.user()?.id)); this.loadingJobs.set(false); },
      error: () => this.loadingJobs.set(false),
    });
  }

  deleteJob(id: string): void {
    if (!confirm('Delete this job?')) return;
    this.deletingJobId.set(id);
    this.jobService.deleteJob(id).subscribe({
      next: () => { this.myJobs.update(l => l.filter(j => j.id !== id)); this.toast.success('user.profile.toast.jobDeleted'); this.deletingJobId.set(null); },
      error: () => { this.toast.error('user.profile.toast.failedDeleteJob'); this.deletingJobId.set(null); },
    });
  }

  /** Fallback avatar for a job with no company logo/image — same hash-based
   * palette as the main Jobs page's getAvatarColor(), so the two read as
   * the same visual system. */
  getJobAvatarColor(job: Job): string {
    const colors = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#F97316', '#06B6D4', '#EC4899', '#6366F1'];
    const name = job.companyName ?? job.user?.userName ?? job.id ?? '';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  getJobInitials(job: Job): string {
    const name = job.companyName ?? job.user?.displayName ?? job.user?.userName ?? '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  }

  loadMyPosts(): void {
    this.loadingPosts.set(true);
    this.postService.getMyPosts({ page: 1, limit: 50 }).subscribe({
      next: (r) => { this.myPosts.set(r.data); this.loadingPosts.set(false); },
      error: () => this.loadingPosts.set(false),
    });
  }

  deletePost(id: string): void {
    if (!confirm('Delete this post?')) return;
    this.deletingPostId.set(id);
    this.postService.deletePost(id).subscribe({
      next: () => { this.myPosts.update(l => l.filter(p => p.id !== id)); this.toast.success('user.profile.toast.postDeleted'); this.deletingPostId.set(null); },
      error: () => { this.toast.error('user.profile.toast.failedDeletePost'); this.deletingPostId.set(null); },
    });
  }

  loadMyEvents(): void {
    this.loadingEvents.set(true);
    this.eventService.getMyEvents({ page: 1, limit: 50 }).subscribe({
      next: (r) => { this.myEvents.set(r.data); this.loadingEvents.set(false); },
      error: () => this.loadingEvents.set(false),
    });
  }

  deleteEvent(id: string): void {
    if (!confirm('Delete this event?')) return;
    this.deletingEventId.set(id);
    this.eventService.deleteEvent(id).subscribe({
      next: () => { this.myEvents.update(l => l.filter(e => e.id !== id)); this.toast.success('user.profile.toast.eventDeleted'); this.deletingEventId.set(null); },
      error: () => { this.toast.error('user.profile.toast.failedDeleteEvent'); this.deletingEventId.set(null); },
    });
  }
}
