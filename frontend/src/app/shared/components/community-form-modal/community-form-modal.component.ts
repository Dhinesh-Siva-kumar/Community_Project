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
import { MultiSelectComponent } from '../multi-select/multi-select.component';
import { RadioGroupComponent, RadioOption } from '../radio-group/radio-group.component';
import { ToggleComponent } from '../toggle/toggle.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { CommunityRulesInputComponent } from '../community-rules-input/community-rules-input.component';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { FORM_DATA_FIELD_NAMES } from '../../../core/constants/upload.constants';
import { TranslatePipe } from '@ngx-translate/core';

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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, MultiSelectComponent, RadioGroupComponent, ToggleComponent, FileUploadComponent, CommunityRulesInputComponent, ImageUrlPipe, TranslatePipe],
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
  /** Set from the backend's HUB_COMMUNITY_ALREADY_EXISTS_FOR_COUNTRY error — shown inline in the modal. */
  hubCountryConflict = signal<string | null>(null);

  /** Suppresses the communityType side effects (see initForm) while programmatically loading form data (create reset / edit load). */
  private suppressTypeSideEffects = false;

  isAdminUser = computed(() => this.authService.currentUser()?.role === 'ADMIN');
  isEditing = computed(() => !!this.editingCommunity());
  modalTitle = computed(() => this.isEditing() ? 'components.communityForm.editTitle' : 'components.communityForm.createTitle');

  // ── Radio group options (app-radio-group) ────────────────────
  /**
   * Non-admins only ever get Private — Global is admin-only. Hub communities
   * are always Private (country-scoped) too, so Global drops out once an
   * admin picks Hub. Reads the live form value (not a signal), so this is a
   * plain method re-evaluated each change-detection pass rather than a
   * `computed()`.
   */
  visibilityOptions(): RadioOption[] {
    const opts: RadioOption[] = [{ value: 'private', label: 'components.communityForm.visibility.private', icon: 'bi-lock-fill' }];
    const isHub = this.communityForm?.get('communityType')?.value === 'HUB';
    if (this.isAdminUser() && !isHub) opts.push({ value: 'global', label: 'components.communityForm.visibility.global', icon: 'bi-globe2' });
    return opts;
  }

  readonly communityModeOptions: RadioOption[] = [
    { value: 'HELP_EMERGENCY', label: 'components.communityForm.mode.helpEmergency', icon: 'bi-life-preserver' },
    { value: 'ENQUIRE',        label: 'components.communityForm.mode.enquire',             icon: 'bi-question-circle-fill' },
  ];

  /** Admin-only — non-admins never see this field, their communities are always Individual. */
  readonly communityTypeOptions: RadioOption[] = [
    { value: 'INDIVIDUAL', label: 'components.communityForm.communityType.individual', icon: 'bi-people-fill' },
    { value: 'HUB',        label: 'components.communityForm.communityType.hub',        icon: 'bi-globe-americas' },
  ];

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
      // Required only for Individual communities (1–3 categories) — Hub
      // communities carry none; enforced manually in submitForm() since it
      // depends on the communityType field.
      interests:     [[] as number[]],
      description:   ['', [Validators.required, noWhitespace, Validators.maxLength(500)]],
      visibility:    [''],
      isDefault:     [false],
      countryId:     [null, Validators.required],
      communityMode: ['HELP_EMERGENCY', Validators.required],
      communityType: ['INDIVIDUAL', Validators.required],
      rules:         [[] as string[]],
    });

    // Hub communities are always Private (country-scoped), always Default
    // (still user-adjustable — not disabled), and never carry a category —
    // the Category field itself is disabled (not just optional) while Hub
    // is selected. Switching back to Individual restores Default to its
    // normal false starting point and re-enables Category. Only reachable
    // by admins — communityType never leaves INDIVIDUAL for anyone else.
    // `suppressTypeSideEffects` guards edit-load/reset patches (which also
    // set communityType) from re-triggering these as if the admin had just
    // switched types by hand.
    this.communityForm.get('communityType')?.valueChanges.subscribe((type) => {
      const interestsControl = this.communityForm.get('interests');
      if (type === 'HUB') {
        interestsControl?.disable({ emitEvent: false });
        if (!this.suppressTypeSideEffects) {
          this.communityForm.patchValue({ visibility: 'private', isDefault: true, interests: [] });
        }
      } else {
        interestsControl?.enable({ emitEvent: false });
        if (!this.suppressTypeSideEffects) {
          this.communityForm.patchValue({ isDefault: false });
        }
      }
    });

    // Clear a stale "Hub already exists for this country" error as soon as
    // the admin changes anything — the previous check no longer applies.
    this.communityForm.valueChanges.subscribe(() => this.hubCountryConflict.set(null));
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
      error: () => this.toast.error('components.communityForm.toast.countriesFailed'),
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
      error: () => this.toast.error('components.communityForm.toast.categoriesFailed'),
    });
  }

  private resetForCreate(): void {
    this.editingCommunity.set(null);
    this.communityForm.reset();
    this.formSubmitAttempted.set(false);

    const patches: Record<string, unknown> = {};
    const defaultCountry = this.countries.find((c) => c.iso2 === 'IN');
    if (defaultCountry) patches['countryId'] = defaultCountry.id;
    patches['communityMode'] = 'HELP_EMERGENCY';
    patches['communityType'] = 'INDIVIDUAL';
    patches['rules'] = [];
    // Private is the default visibility for every new community — non-admins
    // only ever see this option anyway; admins can still switch to Global.
    patches['visibility'] = 'private';
    this.suppressTypeSideEffects = true;
    if (Object.keys(patches).length) this.communityForm.patchValue(patches);
    this.suppressTypeSideEffects = false;

    this.selectedImage.set(null);
  }

  private loadForEdit(id: string): void {
    this.communityService.getCommunity(id).subscribe({
      next: (community) => this.applyEditFormData(community),
      error: () => { this.toast.error('components.communityForm.toast.detailsFailed'); this.closed.emit(); },
    });
  }

  private applyEditFormData(community: Community): void {
    this.editingCommunity.set(community);
    this.formSubmitAttempted.set(false);
    const c = community as any;
    this.suppressTypeSideEffects = true;
    this.communityForm.patchValue({
      communityName: community.name,
      description:   community.description ?? '',
      interests:     c['interest_ids'] ?? (c['interest_id'] ? [c['interest_id']] : []),
      countryId:     c['country_id'] ?? null,
      visibility:    c['is_private'] ? 'private' : c['is_global'] ? 'global' : '',
      isDefault:     c['is_default'] ?? false,
      communityMode: c['community_mode'] ?? 'HELP_EMERGENCY',
      communityType: c['community_type'] ?? 'INDIVIDUAL',
      rules:         c['rules'] ?? [],
    });
    this.suppressTypeSideEffects = false;
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
    this.hubCountryConflict.set(null);

    const formData = this.communityForm.value;

    // Image required on create — except for Hub communities, where it's optional.
    const imageValid = this.isEditing() || formData.communityType === 'HUB' || !!this.selectedImage();
    const visibilityValid = this.isEditing() || !!formData.visibility;
    // Category required for Individual communities only — optional (and
    // never stored) for Hub.
    const categoriesValid = formData.communityType === 'HUB' || (Array.isArray(formData.interests) && formData.interests.length > 0);

    if (this.communityForm.invalid || !imageValid || !visibilityValid || !categoriesValid) {
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
            this.toast.success(editing ? 'components.communityForm.toast.resubmitted' : 'components.communityForm.toast.submitted');
          } else {
            this.toast.success(editing ? 'components.communityForm.toast.updated' : 'components.communityForm.toast.created');
          }
          this.submitting.set(false);
          this.saved.emit(community);
          this.closed.emit();
        },
        error: (err: any) => {
          if (err?.error?.code === 'HUB_COMMUNITY_ALREADY_EXISTS_FOR_COUNTRY') {
            this.hubCountryConflict.set(err.error.message as string);
          } else {
            const editing = this.editingCommunity();
            this.toast.error(editing ? 'components.communityForm.toast.updateFailed' : 'components.communityForm.toast.createFailed');
          }
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
    // Community Type isn't shown to non-admins — their communities are
    // always Individual regardless of what the form control holds.
    const communityType = admin ? (form.communityType ?? 'INDIVIDUAL') : 'INDIVIDUAL';
    // Hub communities carry no category at all, regardless of what's left
    // in the (hidden) field from before the type was switched.
    const interestIds: number[] = communityType === 'HUB' ? [] : (form.interests ?? []);

    return {
      name:        form.communityName,
      description: form.description || undefined,
      image,
      interest_ids: interestIds,
      country:     selectedCountry?.name,
      country_id:  form.countryId || undefined,
      is_private:  admin ? form.visibility === 'private' : true,
      is_global:   admin ? form.visibility === 'global' : false,
      is_default:  admin ? (form.isDefault ?? false) : false,
      community_mode: form.communityMode ?? 'HELP_EMERGENCY',
      community_type: communityType,
      rules:       form.rules ?? [],
    };
  }
}
