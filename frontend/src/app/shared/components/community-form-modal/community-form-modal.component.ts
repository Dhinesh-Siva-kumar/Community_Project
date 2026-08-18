import { Component, OnChanges, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { CommunityService } from '../../../core/services/community.service';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community, CommunityRequest, Country, interests } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { CommunityRulesInputComponent } from '../community-rules-input/community-rules-input.component';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { FORM_DATA_FIELD_NAMES } from '../../../core/constants/upload.constants';

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

/**
 * The single Add/Edit Community form modal — a straight port of the admin
 * Community page's create/edit modal (same fields, same chrome), so the
 * user side gets identical design and functionality — except non-admin
 * callers are restricted to Private visibility and can't set a community as
 * Default, since both Global and Default force-enroll every active user on
 * the platform as a member the instant the community is saved (an
 * admin-only bulk action; the backend rejects it too, this is UI-level).
 * Shared by the user Community list page and the community detail page.
 */
@Component({
  selector: 'app-community-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, FileUploadComponent, CommunityRulesInputComponent, ImageUrlPipe],
  templateUrl: './community-form-modal.component.html',
  styleUrls: ['./community-form-modal.component.scss'],
})
export class CommunityFormModalComponent implements OnChanges {
  private communityService = inject(CommunityService);
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  @Input() open = false;
  @Input() editCommunityId: string | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful create/update; the host is responsible for updating its own list state. */
  @Output() saved = new EventEmitter<Community>();

  submitting = signal(false);
  formSubmitAttempted = signal(false);
  editingCommunity = signal<Community | null>(null);
  selectedImage = signal<File | null>(null);

  isAdminUser = computed(() => this.authService.currentUser()?.role === 'ADMIN');
  isEditing = computed(() => !!this.editingCommunity());
  modalTitle = computed(() => this.isEditing() ? 'Edit Community' : 'Create Community');

  countries: Country[] = [];
  interests: interests[] = [];
  interestOptions: SelectOption[] = [];
  countryOptions: SelectOption[] = [];
  private countriesLoaded = false;
  private interestsLoaded = false;

  communityForm!: FormGroup;

  get f() {
    return this.communityForm.controls;
  }

  constructor() {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.loadCountriesIfNeeded();
      this.loadInterestsIfNeeded();
      if (this.editCommunityId) {
        this.loadForEdit(this.editCommunityId);
      } else {
        this.resetForCreate();
      }
    }
  }

  private initForm(): void {
    this.communityForm = this.fb.group({
      communityName: ['', [Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(150)]],
      interests:     [null, Validators.required],
      description:   ['', [Validators.required, noWhitespace, Validators.maxLength(500)]],
      visibility:    [''],
      isDefault:     [false],
      countryId:     [null, Validators.required],
      communityMode: ['HELP_EMERGENCY', Validators.required],
      rules:         [[] as string[]],
    });
  }

  private loadCountriesIfNeeded(): void {
    if (this.countriesLoaded) return;
    this.countriesLoaded = true;
    this.authService.getCountries().subscribe({
      next: (res: any) => {
        this.countries = res.data ?? res ?? [];
        this.countryOptions = this.countries.map((c) => {
          const flag = c.flag_emoji || [...c.iso2.toUpperCase()].map((ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))).join('');
          return { value: c.id, label: `${flag} ${c.name}` };
        });
      },
      error: () => this.toast.error('Failed to load countries'),
    });
  }

  private loadInterestsIfNeeded(): void {
    if (this.interestsLoaded) return;
    this.interestsLoaded = true;
    this.authService.getInterests().subscribe({
      next: (res: any) => {
        this.interests = res.data ?? res ?? [];
        this.interestOptions = this.interests.map((i) => ({ value: i.interest_id, label: i.interest_name }));
      },
      error: () => this.toast.error('Failed to load categories'),
    });
  }

  private resetForCreate(): void {
    this.editingCommunity.set(null);
    this.communityForm.reset();
    this.formSubmitAttempted.set(false);

    const patches: Record<string, unknown> = {};
    const defaultCountry = this.countries.find((c) => c.name === 'India');
    if (defaultCountry) patches['countryId'] = defaultCountry.id;
    patches['communityMode'] = 'HELP_EMERGENCY';
    patches['rules'] = [];
    // Non-admins only ever create Private communities — pre-select it since
    // it's the only option they'll see.
    if (!this.isAdminUser()) patches['visibility'] = 'private';
    if (Object.keys(patches).length) this.communityForm.patchValue(patches);

    this.selectedImage.set(null);
  }

  private loadForEdit(id: string): void {
    this.communityService.getCommunity(id).subscribe({
      next: (community) => this.applyEditFormData(community),
      error: () => { this.toast.error('Failed to load community details'); this.closed.emit(); },
    });
  }

  private applyEditFormData(community: Community): void {
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
  }

  onCommunityImageChange(files: File[]): void {
    this.selectedImage.set(files[0] ?? null);
  }

  requestClose(): void {
    this.closed.emit();
  }

  submitForm(): void {
    this.formSubmitAttempted.set(true);
    this.communityForm.markAllAsTouched();

    const formData = this.communityForm.value;

    const imageValid = this.isEditing() || !!this.selectedImage();
    const visibilityValid = this.isEditing() || !!formData.visibility;

    if (this.communityForm.invalid || !imageValid || !visibilityValid) {
      return;
    }

    this.submitting.set(true);
    const file = this.selectedImage();

    const upload$: Observable<{ path: string } | null> = file
      ? this.apiService.postWithFile<{ path: string }>('/upload', { folder: 'communities' }, [{ field: FORM_DATA_FIELD_NAMES.FILE, file }])
      : of(null);

    upload$
      .pipe(
        switchMap((uploadResult: { path: string } | null) => {
          const payload = this.mapToPayload(formData, uploadResult?.path ?? null);
          const editing = this.editingCommunity();
          return editing
            ? this.communityService.updateCommunity(editing.id, payload)
            : this.communityService.createCommunity(payload);
        }),
      )
      .subscribe({
        next: (community) => {
          const editing = this.editingCommunity();
          if (community.status === 'PENDING') {
            this.toast.success(editing ? 'Community resubmitted for admin approval' : 'Community submitted for admin approval');
          } else {
            this.toast.success(editing ? 'Community updated successfully' : 'Community created successfully');
          }
          this.submitting.set(false);
          this.saved.emit(community);
          this.closed.emit();
        },
        error: (err) => {
          const editing = this.editingCommunity();
          this.toast.error(err?.error?.message ?? (editing ? 'Failed to update community' : 'Failed to create community'));
          this.submitting.set(false);
        },
      });
  }

  private mapToPayload(form: any, newImageUrl: string | null): CommunityRequest {
    const selectedCountry = this.countries.find((c) => c.id === form.countryId);

    let image: string | undefined;
    if (newImageUrl) {
      image = newImageUrl;
    } else if (this.isEditing() && !this.selectedImage()) {
      image = this.editingCommunity()?.image ?? undefined;
    }

    // Non-admins can never submit Global/Default regardless of what the form
    // holds — the backend rejects it too, but keeping the client payload
    // honest avoids a round-trip 403 for the normal case.
    const admin = this.isAdminUser();

    return {
      name:        form.communityName,
      description: form.description || undefined,
      image,
      interest_id: form.interests || undefined,
      country:     selectedCountry?.name,
      country_id:  form.countryId || undefined,
      is_private:  admin ? form.visibility === 'private' : true,
      is_global:   admin ? form.visibility === 'global' : false,
      is_default:  admin ? (form.isDefault ?? false) : false,
      community_mode: form.communityMode ?? 'HELP_EMERGENCY',
      rules:       form.rules ?? [],
    };
  }
}
