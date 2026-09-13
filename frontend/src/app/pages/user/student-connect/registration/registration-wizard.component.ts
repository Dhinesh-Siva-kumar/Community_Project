import { Component, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SearchableSelectComponent, SelectOption } from '../../../../shared/components/searchable-select/searchable-select.component';
import { MasterDataService } from '../../../../core/services/master-data.service';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { ApiService } from '../../../../core/services/api.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudyLevel } from '../../../../core/models';

const LANGUAGE_OPTIONS = ['Tamil', 'English', 'German', 'French', 'Hindi'];
const HELP_OPTIONS = ['University Life', 'Accommodation', 'Course Experience', 'Cultural Adjustment'];
const STUDY_LEVELS: StudyLevel[] = ["Bachelor's", "Master's", 'PhD', 'Diploma'];
const YEAR_OPTIONS = ['1st year', '2nd year', '3rd year', 'Final year'];

/**
 * 4-step registration wizard (STUDENT_CONNECT_SPEC.md §5.1) — Basic Info →
 * Education → Languages & About → Review & Submit. Shown in place of the
 * module's tab strip until the current user has a student_profiles row.
 */
@Component({
  selector: 'app-student-registration-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, SearchableSelectComponent],
  templateUrl: './registration-wizard.component.html',
  styleUrls: ['./registration-wizard.component.scss'],
})
export class StudentRegistrationWizardComponent {
  private masterData = inject(MasterDataService);
  private studentConnectService = inject(StudentConnectService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  @Output() registered = new EventEmitter<void>();

  readonly studyLevels = STUDY_LEVELS;
  readonly yearOptions = YEAR_OPTIONS;
  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly helpOptions = HELP_OPTIONS;

  step = signal(1);
  submitting = signal(false);
  uploadingPhoto = signal(false);

  // Step 1
  firstName = signal('');
  countryId = signal<number | null>(null);
  cityFreeText = signal('');
  photoUrl = signal<string | undefined>(undefined);

  // Step 2
  universityId = signal<number | null>(null);
  universityFreeText = signal('');
  course = signal('');
  studyLevel = signal<StudyLevel>("Master's");
  yearOfStudy = signal('2nd year');

  // Step 3
  languages = signal<string[]>(['Tamil', 'English']);
  shortIntro = signal('');
  previousCountryId = signal<number | null>(null);
  academicBackground = signal('');
  areasOfHelp = signal<string[]>([]);

  countries = signal<SelectOption[]>([]);
  universities = signal<SelectOption[]>([]);

  constructor() {
    this.masterData.getCountries().subscribe({
      next: (list) => this.countries.set(list.map((c: any) => ({ value: c.id, label: c.name }))),
      error: () => {},
    });
  }

  onCountryChange(id: number | string | null): void {
    this.countryId.set(id ? Number(id) : null);
    this.universityId.set(null);
    this.universities.set([]);
    if (id) {
      this.masterData.getUniversities(Number(id)).subscribe({
        next: (list) => this.universities.set(list.map((u) => ({ value: u.id, label: u.name }))),
        error: () => {},
      });
    }
  }

  onPreviousCountryChange(id: number | string | null): void {
    this.previousCountryId.set(id ? Number(id) : null);
  }

  onUniversityChange(id: number | string | null): void {
    this.universityId.set(id ? Number(id) : null);
  }

  toggleLanguage(lang: string): void {
    this.languages.update((list) => list.includes(lang) ? list.filter((l) => l !== lang) : [...list, lang]);
  }

  toggleHelp(item: string): void {
    this.areasOfHelp.update((list) => list.includes(item) ? list.filter((l) => l !== item) : [...list, item]);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingPhoto.set(true);
    this.api.postWithFile<{ path: string }>('/upload', { folder: 'student-connect' }, [{ field: 'file', file }]).subscribe({
      next: (res) => {
        this.photoUrl.set(res.path);
        this.uploadingPhoto.set(false);
      },
      error: () => {
        this.toast.error('user.studentConnect.registration.photoUploadFailed');
        this.uploadingPhoto.set(false);
      },
    });
  }

  goToStep(n: number): void {
    this.step.set(n);
  }

  reviewItems = computed(() => [
    { label: 'user.studentConnect.registration.review.name', value: this.firstName() },
    { label: 'user.studentConnect.registration.review.country', value: this.countries().find((c) => c.value === this.countryId())?.label ?? '' },
    { label: 'user.studentConnect.registration.review.city', value: this.cityFreeText() },
    { label: 'user.studentConnect.registration.review.university', value: this.universities().find((u) => u.value === this.universityId())?.label ?? this.universityFreeText() },
    { label: 'user.studentConnect.registration.review.course', value: this.course() },
    { label: 'user.studentConnect.registration.review.studyLevel', value: `${this.studyLevel()} · ${this.yearOfStudy()}` },
    { label: 'user.studentConnect.registration.review.languages', value: this.languages().join(', ') || '—' },
  ]);

  canSubmit = computed(() =>
    !!this.firstName().trim() && !!this.countryId() && !!this.course().trim() &&
    !!this.yearOfStudy() && this.languages().length > 0 && !!this.shortIntro().trim(),
  );

  submit(): void {
    if (!this.canSubmit() || this.submitting()) return;

    this.submitting.set(true);
    this.studentConnectService.registerProfile({
      firstName: this.firstName().trim(),
      photoUrl: this.photoUrl(),
      countryId: this.countryId()!,
      cityFreeText: this.cityFreeText().trim() || undefined,
      universityId: this.universityId() ?? undefined,
      universityFreeText: this.universityId() ? undefined : (this.universityFreeText().trim() || undefined),
      course: this.course().trim(),
      studyLevel: this.studyLevel(),
      yearOfStudy: this.yearOfStudy(),
      languages: this.languages(),
      shortIntro: this.shortIntro().trim(),
      previousCountryId: this.previousCountryId() ?? undefined,
      academicBackground: this.academicBackground().trim() || undefined,
      areasOfHelp: this.areasOfHelp(),
    }).subscribe({
      next: () => {
        this.toast.success('user.studentConnect.registration.toastSubmitted');
        this.submitting.set(false);
        this.registered.emit();
      },
      error: () => {
        this.toast.error('user.studentConnect.registration.toastFailed');
        this.submitting.set(false);
      },
    });
  }
}
