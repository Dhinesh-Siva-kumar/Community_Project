import { Component, OnInit, OnDestroy, EventEmitter, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { StudentConnectService } from '../../../../core/services/student-connect.service';
import { MasterDataService } from '../../../../core/services/master-data.service';
import { ToastService } from '../../../../core/services/toast.service';
import { StudentDirectoryEntry, StudyLevel } from '../../../../core/models';
import { StudentCardComponent } from '../student-card/student-card.component';
import { SearchableSelectComponent, SelectOption } from '../../../../shared/components/searchable-select/searchable-select.component';

const STUDY_LEVELS: StudyLevel[] = ["Bachelor's", "Master's", 'PhD', 'Diploma'];
const LANGUAGE_OPTIONS = ['Tamil', 'English', 'German', 'French'];
const PAGE_SIZE = 12;

interface ActiveFilterChip {
  key: 'countryId' | 'studyLevel' | 'language' | 'verifiedOnly' | 'mentorOnly' | 'freeOnly';
  label: string;
}

/**
 * Discover screen (STUDENT_CONNECT_SPEC.md §5.2) — search + "Advanced
 * Filters" drawer, mirroring the Jobs/Business pages' filter-panel pattern
 * (own `sc-` prefix, same drawer mechanics) rather than a bespoke design.
 */
@Component({
  selector: 'app-student-discover',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, StudentCardComponent, SearchableSelectComponent],
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.scss'],
})
export class StudentDiscoverComponent implements OnInit, OnDestroy {
  private studentConnectService = inject(StudentConnectService);
  private masterData = inject(MasterDataService);
  private toast = inject(ToastService);
  private translate = inject(TranslateService);

  @Output() viewProfile = new EventEmitter<string>();

  readonly studyLevels = STUDY_LEVELS;
  readonly languageOptions = LANGUAGE_OPTIONS;

  searchQuery = signal('');
  countryId = signal<number | null>(null);
  studyLevel = signal<StudyLevel | ''>('');
  language = signal('');
  verifiedOnly = signal(false);
  mentorOnly = signal(false);
  freeOnly = signal(false);

  showAdvancedFilters = signal(false);
  results = signal<StudentDirectoryEntry[]>([]);
  loading = signal(false);
  page = signal(1);
  totalPages = signal(1);

  countries = signal<SelectOption[]>([]);

  private searchInput$ = new Subject<string>();

  activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (this.countryId()) {
      const label = this.countries().find((c) => c.value === this.countryId())?.label ?? '';
      chips.push({ key: 'countryId', label });
    }
    if (this.studyLevel()) chips.push({ key: 'studyLevel', label: this.studyLevel() as string });
    if (this.language()) chips.push({ key: 'language', label: this.language() });
    if (this.verifiedOnly()) chips.push({ key: 'verifiedOnly', label: this.translate.instant('user.studentConnect.discover.verifiedOnly') });
    if (this.mentorOnly()) chips.push({ key: 'mentorOnly', label: this.translate.instant('user.studentConnect.discover.mentorAvailable') });
    if (this.freeOnly()) chips.push({ key: 'freeOnly', label: this.translate.instant('user.studentConnect.discover.freeChat') });
    return chips;
  });

  ngOnInit(): void {
    this.masterData.getCountries().subscribe({
      next: (list) => this.countries.set(list.map((c: any) => ({ value: c.id, label: c.name }))),
      error: () => {},
    });

    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.loadResults(1));

    this.loadResults(1);
  }

  ngOnDestroy(): void {
    this.searchInput$.complete();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchInput$.next(value);
  }

  onCountryChange(id: number | string | null): void {
    this.countryId.set(id ? Number(id) : null);
    this.loadResults(1);
  }

  setStudyLevel(level: StudyLevel | ''): void {
    this.studyLevel.set(level);
    this.loadResults(1);
  }

  setLanguage(lang: string): void {
    this.language.set(lang);
    this.loadResults(1);
  }

  toggleVerifiedOnly(): void {
    this.verifiedOnly.update((v) => !v);
    this.loadResults(1);
  }

  toggleMentorOnly(): void {
    this.mentorOnly.update((v) => !v);
    this.loadResults(1);
  }

  toggleFreeOnly(): void {
    this.freeOnly.update((v) => !v);
    this.loadResults(1);
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update((v) => !v);
  }

  closeAdvancedFilters(): void {
    this.showAdvancedFilters.set(false);
  }

  removeFilter(key: ActiveFilterChip['key']): void {
    switch (key) {
      case 'countryId': this.countryId.set(null); break;
      case 'studyLevel': this.studyLevel.set(''); break;
      case 'language': this.language.set(''); break;
      case 'verifiedOnly': this.verifiedOnly.set(false); break;
      case 'mentorOnly': this.mentorOnly.set(false); break;
      case 'freeOnly': this.freeOnly.set(false); break;
    }
    this.loadResults(1);
  }

  clearAllFilters(): void {
    this.countryId.set(null);
    this.studyLevel.set('');
    this.language.set('');
    this.verifiedOnly.set(false);
    this.mentorOnly.set(false);
    this.freeOnly.set(false);
    this.loadResults(1);
  }

  loadResults(page: number): void {
    this.loading.set(true);
    this.studentConnectService.search({
      q: this.searchQuery() || undefined,
      countryId: this.countryId() ?? undefined,
      studyLevel: (this.studyLevel() as StudyLevel) || undefined,
      language: this.language() || undefined,
      verifiedOnly: this.verifiedOnly() || undefined,
      mentorOnly: this.mentorOnly() || undefined,
      freeOnly: this.freeOnly() || undefined,
      page,
      limit: PAGE_SIZE,
    }).subscribe({
      next: (res) => {
        this.results.set(page === 1 ? res.data : [...this.results(), ...res.data]);
        this.page.set(res.page);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('user.studentConnect.discover.loadFailed');
      },
    });
  }

  loadMore(): void {
    if (this.page() < this.totalPages() && !this.loading()) {
      this.loadResults(this.page() + 1);
    }
  }

  onViewProfile(userId: string): void {
    this.viewProfile.emit(userId);
  }

  onToggleSave(userId: string): void {
    this.studentConnectService.toggleSaved(userId).subscribe({
      next: (res) => {
        this.results.update((list) => list.map((p) => p.userId === userId ? { ...p, isSaved: res.saved } : p));
      },
      error: () => this.toast.error('user.studentConnect.discover.saveFailed'),
    });
  }
}
