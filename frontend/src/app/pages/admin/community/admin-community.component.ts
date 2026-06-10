import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { CommunityService } from '../../../core/services/community.service';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, CommunityRequest, Country, interests, PaginatedResponse } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';

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
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule, SearchableSelectComponent, ImageUrlPipe, FileUploadComponent],
  templateUrl: './admin-community.component.html',
  styleUrls: ['./admin-community.component.scss'],
})
export class AdminCommunityComponent implements OnInit {
  private communityService = inject(CommunityService);
  private apiService = inject(ApiService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  countries: Country[] = [];
  interests: interests[] = [];
  interestOptions: SelectOption[] = [];
  countryOptions: SelectOption[] = [];

  // ── Filter dropdown options ───────────────────────────────
  filterCountryOptions:    SelectOption[] = [];
  filterCategoryOptions:   SelectOption[] = [];
  filterVisibilityOptions: SelectOption[] = [
    { value: 'global',  label: 'Global'  },
    { value: 'private', label: 'Private' },
    { value: 'default', label: 'Default' },
  ];

  // ── Signals ──────────────────────────────────────────────────
  communities        = signal<Community[]>([]);
  loading            = signal(true);
  searchTerm         = signal('');
  currentPage        = signal(1);
  totalPages         = signal(1);
  totalItems         = signal(0);
  pageSize           = signal(9);
  submitting         = signal(false);
  showModal          = signal(false);
  editingCommunity   = signal<Community | null>(null);
  selectedImage      = signal<File | null>(null);
  deleteConfirmId    = signal<string | null>(null);
  formSubmitAttempted = signal(false);

  // ── Filter signals ────────────────────────────────────────
  filterCountry    = signal<string | number | null>(null);
  filterCategory   = signal<string | number | null>(null);
  filterVisibility = signal<string | number | null>(null);
  filterFromDate   = signal('');
  filterToDate     = signal('');

  // ── Computed ─────────────────────────────────────────────────
  /** Server-side filtering: component list is whatever the API returned. */
  filteredCommunities = computed(() => this.communities());

  /** True when any search or filter criterion is active. */
  hasActiveFilters = computed(() =>
    !!(
      this.searchTerm()      ||
      this.filterCountry()   ||
      this.filterCategory()  ||
      this.filterVisibility() ||
      this.filterFromDate()  ||
      this.filterToDate()
    ),
  );

  isEditing  = computed(() => !!this.editingCommunity());
  modalTitle = computed(() => (this.isEditing() ? 'Edit Community' : 'Create Community'));

  // ── Form ─────────────────────────────────────────────────────
  communityForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();
    this.loadCountries();
    this.loadInterests();
    this.loadCommunities();
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
        this.filterCountryOptions = this.countries.map((c) => ({
          value: c.name,
          label: c.name,
        }));
        // Pre-select India as default for new communities.
        const defaultCountry = this.countries.find((c) => c.name === 'India');
        if (defaultCountry) {
          this.communityForm.patchValue({ countryId: defaultCountry.id });
        }
      },
      error: () => this.toastService.error('Failed to load countries'),
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
      error: () => this.toastService.error('Failed to load interests'),
    });
  }

  loadCommunities(): void {
    this.loading.set(true);
    const params: Record<string, any> = {
      user_id: this.authService.currentUser()?.id ?? 39,
      page: this.currentPage(),
      limit: this.pageSize(),
    };
    // Only append filter params when they carry a non-empty value.
    if (this.searchTerm())       params['search']     = this.searchTerm();
    if (this.filterCountry())    params['country']    = String(this.filterCountry());
    if (this.filterCategory())   params['category']   = String(this.filterCategory());
    if (this.filterVisibility()) params['visibility'] = String(this.filterVisibility());
    if (this.filterFromDate())   params['from_date']  = this.filterFromDate();
    if (this.filterToDate())     params['to_date']    = this.filterToDate();

    this.communityService.getCommunities(params).subscribe({
      next: (response: PaginatedResponse<Community>) => {
        this.communities.set(response.data);
        this.totalPages.set(response.totalPages);
        this.totalItems.set(response.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load communities');
        this.loading.set(false);
      },
    });
  }

  // ── Search / pagination ───────────────────────────────────────
  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
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
    this.filterFromDate.set('');
    this.filterToDate.set('');
    this.currentPage.set(1);
    this.loadCommunities();
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
      ? this.apiService.postWithFile<{ path: string }>('/upload', {}, [{ field: 'file', file }])
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
          this.loadCommunities();
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
  confirmDelete(id: string): void {
    this.deleteConfirmId.set(id);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  deleteCommunity(id: string): void {
    this.communityService.deleteCommunity(id).subscribe({
      next: () => {
        this.toast.success('Community deleted successfully');
        this.deleteConfirmId.set(null);
        this.loadCommunities();
      },
      error: () => {
        this.toast.error('Failed to delete community');
        this.deleteConfirmId.set(null);
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
    if (community.is_private) return 'Private';
    if (community.is_global)  return 'Global';
    if (community.is_default) return 'Default';
    return null;
  }

  truncate(text: string | undefined, length: number): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
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
    };
  }
}
