import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessService } from '../../../core/services/business.service';
import { CommunityService } from '../../../core/services/community.service';
import { JobService } from '../../../core/services/job.service';
import { PostService } from '../../../core/services/post.service';
import { ToastService } from '../../../core/services/toast.service';
import { GeographyService } from '../../../core/services/geography.service';
import { User, Business, Community, Job, Post, GeoCountry, CountryAddressConfig, Division } from '../../../core/models';
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
    ImageUrlPipe,
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class UserProfileComponent implements OnInit {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private communityService = inject(CommunityService);
  private jobService = inject(JobService);
  private postService = inject(PostService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
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
  loadingBusinesses = signal(false);
  loadingCommunities = signal(false);
  loadingJobs = signal(false);
  loadingPosts = signal(false);
  showDeleteBusinessModal = signal(false);
  businessToDelete = signal<Business | null>(null);
  showDeleteCommunityModal = signal(false);
  communityToDelete = signal<Community | null>(null);
  deletingJobId = signal<string | null>(null);
  deletingPostId = signal<string | null>(null);

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

  completionItems = computed(() => {
    const u = this.user();
    if (!u) return [];
    return [
      { label: 'Username',              done: !!u.userName },
      { label: 'Display Name',          done: !!u.displayName },
      { label: 'Email',                 done: !!u.email },
      { label: 'Phone Number',          done: !!u.phoneNo },
      { label: 'Profile Photo',         done: !!u.avatar },
      { label: 'Bio',                   done: !!u.bio },
      { label: 'Location',              done: !!u.location },
      { label: 'Pincode',               done: !!u.pincode },
      { label: 'Interests',             done: u.interests.length > 0 },
      { label: 'Professional Category', done: !!u.professionalCategory },
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

  tabs: ProfileTab[] = [
    { id: 'personal',    label: 'Personal Info',   icon: 'bi-person' },
    { id: 'businesses',  label: 'My Businesses',   icon: 'bi-shop' },
    { id: 'communities', label: 'My Communities',  icon: 'bi-people' },
    { id: 'jobs',        label: 'My Jobs',          icon: 'bi-briefcase' },
    { id: 'posts',       label: 'My Posts',         icon: 'bi-file-post' },
  ];

  profCatOptions: SelectOption[] = [
    'Technology', 'Healthcare', 'Education', 'Finance', 'Legal',
    'Marketing', 'Design', 'Engineering', 'Sales', 'Construction',
    'Hospitality', 'Retail', 'Real Estate', 'Other',
  ].map(c => ({ value: c, label: c }));

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
      email: ['', [Validators.email]],
      phoneNo: ['', [Validators.maxLength(20)]],
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
      bio: u.bio || '',
      pincode: u.pincode || '',
      professionalCategory: u.professionalCategory || '',
      occupation: u.occupation || '',
      company: u.company || '',
      website: u.website || '',
      linkedinUrl: u.linkedinUrl || '',
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
      error: () => this.toast.error('Failed to load country address details'),
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
        this.toast.success('Profile updated successfully'); this.saving.set(false);
      },
      error: () => { this.toast.error('Failed to update profile'); this.saving.set(false); },
    });
  }

  togglePasswordSection(): void { this.showPasswordSection.update(v => !v); this.passwordForm.reset(); }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    const { newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) { this.toast.error('Passwords do not match'); return; }
    this.changingPassword.set(true);
    this.userService.updateProfile({ password: newPassword }).subscribe({
      next: () => { this.toast.success('Password changed successfully'); this.showPasswordSection.set(false); this.passwordForm.reset(); this.changingPassword.set(false); },
      error: () => { this.toast.error('Failed to change password'); this.changingPassword.set(false); },
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
      next: () => { this.myJobs.update(l => l.filter(j => j.id !== id)); this.toast.success('Job deleted'); this.deletingJobId.set(null); },
      error: () => { this.toast.error('Failed to delete job'); this.deletingJobId.set(null); },
    });
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
      next: () => { this.myPosts.update(l => l.filter(p => p.id !== id)); this.toast.success('Post deleted'); this.deletingPostId.set(null); },
      error: () => { this.toast.error('Failed to delete post'); this.deletingPostId.set(null); },
    });
  }
}
