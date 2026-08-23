import { Component, OnInit, HostListener, ElementRef, inject, signal, computed, effect, viewChildren } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService, EventsQueryParams } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, PaginatedResponse, Country } from '../../../core/models';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';

function futureDateValidator(c: AbstractControl): ValidationErrors | null {
  if (!c.value) return null;
  return new Date(c.value) < new Date(new Date().toDateString()) ? { pastDate: true } : null;
}
function endTimeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('eventTime')?.value;
  const end   = group.get('eventEndTime')?.value;
  if (start && end && end <= start) return { endBeforeStart: true };
  return null;
}

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

type SortOption = 'near' | 'soonest' | 'latest';
type ModeFilter = 'all' | 'Offline' | 'Online' | 'Hybrid';

const CATEGORY_ICON: Record<string, string> = {
  Festival: 'bi-stars', Exhibition: 'bi-stars',
  Workshop: 'bi-laptop', Conference: 'bi-laptop', Webinar: 'bi-laptop',
  Concert: 'bi-mic-fill',
  Sports: 'bi-trophy-fill',
  Meetup: 'bi-people-fill', Social: 'bi-people-fill',
  Other: 'bi-calendar-event',
};
const CATEGORY_GRADIENT: Record<string, string> = {
  Festival: 'g-fest', Exhibition: 'g-fest',
  Workshop: 'g-work', Conference: 'g-work', Webinar: 'g-work',
  Concert: 'g-conc',
  Sports: 'g-sport',
  Meetup: 'g-meet', Social: 'g-meet',
  Other: 'g-meet',
};

@Component({
  selector: 'app-user-events',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe, FileUploadComponent, ImageViewerComponent, ImageUrlPipe, SearchableSelectComponent],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class UserEventsComponent implements OnInit {
  private eventService = inject(EventService);
  private authService  = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
  submitting = signal(false);
  skeletons  = Array(8);

  // ── Page tab — 'all' = public browse, 'pending' = the caller's own submissions ──
  pageTab              = signal<'all' | 'pending'>('all');
  myPendingEventsCount = signal(0);

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

  readonly pageSize = 8;
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  searchQuery = signal('');
  modeFilter  = signal<ModeFilter>('all');
  sortOption  = signal<SortOption>('near');
  private searchDebounce: any = null;

  readonly sortOptions: SelectOption[] = [
    { value: 'near',    label: 'Near you first' },
    { value: 'soonest', label: 'Soonest first' },
    { value: 'latest',  label: 'Latest first' },
  ];

  // ── Advanced filters — Country + Event Date range (mirrors the Business
  // page's search card: search + sort in the top row, everything else
  // collapsed behind Advanced Filters) ──
  filterCountry        = signal<string | null>(null);
  filterCountryOptions: SelectOption[] = [];
  filterDateFrom        = signal('');
  filterDateTo          = signal('');
  activeQuickRange      = signal<'today' | '7d' | '30d' | null>(null);
  showAdvancedFilters   = signal(false);

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.modeFilter() !== 'all') count++;
    if (this.filterCountry()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  currentUser   = computed(() => this.authService.currentUser());
  currentUserId = computed(() => this.currentUser()?.id ?? null);
  userPincode   = computed(() => this.currentUser()?.pincode ?? '');
  isAdmin       = computed(() => this.currentUser()?.role === 'ADMIN');

  // ── add / edit modal ──
  showAddModal        = signal(false);
  editingId           = signal<string | null>(null);
  selectedImage       = signal<File | null>(null);
  existingImage       = signal<string | null>(null);
  formSubmitAttempted = signal(false);

  eventForm!: FormGroup;

  readonly EVENT_TYPES = ['Workshop','Meetup','Webinar','Festival','Conference','Exhibition','Concert','Sports','Social','Other'];
  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;
  readonly TIMEZONES   = ['UTC','Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Singapore','Australia/Sydney'];

  readonly categoryOptions: SelectOption[] = this.EVENT_TYPES.map((t) => ({ value: t, label: t }));
  readonly timezoneOptions: SelectOption[] = this.TIMEZONES.map((t) => ({ value: t, label: t }));

  get eventMode(): string { return this.eventForm?.get('eventMode')?.value ?? ''; }
  get showAddress(): boolean      { return this.eventMode === 'Offline' || this.eventMode === 'Hybrid'; }
  get showLocationLink(): boolean { return this.eventMode === 'Online'  || this.eventMode === 'Hybrid'; }

  get f() { return this.eventForm.controls; }

  // ── detail popup ──
  viewingEvent = signal<AppEvent | null>(null);

  // ── delete confirm ──
  confirmDeleteIds = signal<string[] | null>(null);
  bulkProcessing   = signal(false);

  // ── image viewer ──
  imageViewerOpen = signal(false);
  imageViewerImages = signal<string[]>([]);
  imageViewerInitialIndex = signal(0);

  ngOnInit(): void {
    this.initForm();
    this.loadEvents();
    this.loadCountries();
    this.route.queryParams.subscribe(params => {
      const eventId = params['eventId'];
      if (eventId) this.openEventFromQueryParam(eventId);
    });
    this.loadMyPendingEventsCount();
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res: any) => {
        this.filterCountryOptions = (res.data ?? res ?? []).map((c: Country) => ({ value: c.name, label: c.name }));
      },
      error: () => {},
    });
  }

  setPageTab(tab: 'all' | 'pending'): void {
    if (this.pageTab() === tab) return;
    this.pageTab.set(tab);
    if (tab === 'pending') {
      this.loadMyEvents();
    } else {
      this.currentPage.set(1);
      this.loadEvents();
    }
  }

  /** "Pending Approval" tab — the caller's own events across every status (Pending/Approved/Rejected). */
  loadMyEvents(): void {
    this.loading.set(true);
    this.currentPage.set(1);
    this.eventService.getMyEvents({ page: 1, limit: 100 }).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data);
        this.totalItems.set(res.total);
        this.totalPages.set(1);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load your events');
        this.loading.set(false);
      },
    });
  }

  loadMyPendingEventsCount(): void {
    this.eventService.getMyEvents({ page: 1, limit: 1, approvalStatus: 'PENDING' }).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => this.myPendingEventsCount.set(res.total),
      error: () => {},
    });
  }

  // Deep-link support — the dashboard calendar navigates here with
  // ?eventId=xxx to open a specific event's detail popup. The target event
  // may not be on the currently loaded/sorted page, so it's fetched directly
  // rather than looked up in `events()`.
  private openEventFromQueryParam(id: string): void {
    this.eventService.getEvent(id).subscribe({
      next: evt => this.viewingEvent.set(evt),
      error: () => this.toast.error('Event not found or no longer available'),
    });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { eventId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private initForm(): void {
    this.eventForm = this.fb.group({
      title:        ['', [Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(100)]],
      description:  ['', [Validators.required, noWhitespace, minLengthTrimmed(10), Validators.maxLength(1000)]],
      eventCategory:['', Validators.required],
      eventDate:    ['', [Validators.required, futureDateValidator]],
      eventTime:    ['', Validators.required],
      eventEndTime: [''],
      timezone:     ['Asia/Kolkata', Validators.required],
      eventMode:    ['Offline', Validators.required],
      address:      ['', [Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(200)]],
      locationLink: ['', Validators.maxLength(300)],
      pincode:      [this.userPincode(), Validators.maxLength(12)],
      location:     ['', Validators.maxLength(150)],
      country:      [''],
    }, { validators: endTimeValidator });

    // Apply mode-specific validators immediately (not just on the next change) so
    // address/link stay correctly required even if the default eventMode value
    // above ever changes — valueChanges alone only fires on a later user edit.
    this.applyModeValidators(this.eventForm.get('eventMode')!.value);
    this.eventForm.get('eventMode')!.valueChanges.subscribe((mode) => this.applyModeValidators(mode));
  }

  /** (Re)apply the conditional required/format validators for address & meeting link based on event mode. */
  private applyModeValidators(mode: string): void {
    const addr = this.eventForm.get('address')!;
    const link = this.eventForm.get('locationLink')!;

    if (mode === 'Offline') {
      addr.setValidators([Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(200)]);
      link.setValidators([Validators.maxLength(300)]);
    } else if (mode === 'Online') {
      addr.setValidators([Validators.maxLength(200)]);
      link.setValidators([Validators.required, Validators.pattern(/^https?:\/\/.+/), Validators.maxLength(300)]);
    } else if (mode === 'Hybrid') {
      addr.setValidators([Validators.required, noWhitespace, minLengthTrimmed(3), Validators.maxLength(200)]);
      link.setValidators([Validators.required, Validators.pattern(/^https?:\/\/.+/), Validators.maxLength(300)]);
    }

    addr.updateValueAndValidity({ emitEvent: false });
    link.updateValueAndValidity({ emitEvent: false });
  }

  // ── data loading ──
  loadEvents(): void {
    this.loading.set(true);
    const opt = this.sortOption();
    const mode = this.modeFilter();
    const params: EventsQueryParams = {
      page: this.currentPage(),
      limit: this.pageSize,
      search: this.searchQuery() || undefined,
      eventMode: mode === 'all' ? undefined : mode,
      country: this.filterCountry() || undefined,
      eventDateFrom: this.filterDateFrom() || undefined,
      eventDateTo: this.filterDateTo() || undefined,
      sortBy: opt === 'near' ? 'near' : 'eventDate',
      sortDir: opt === 'latest' ? 'desc' : 'asc',
      nearPincode: opt === 'near' ? (this.userPincode() || undefined) : undefined,
    };
    this.eventService.getEvents(params).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load events'); this.loading.set(false); },
    });
  }

  applyFilters(): void { this.currentPage.set(1); this.loadEvents(); }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }
  clearSearch(): void { this.searchQuery.set(''); this.applyFilters(); }
  setModeFilter(mode: ModeFilter): void { this.modeFilter.set(mode); this.applyFilters(); }
  setSortOption(opt: SortOption): void { this.sortOption.set(opt); this.applyFilters(); }

  toggleAdvancedFilters(): void { this.showAdvancedFilters.update(v => !v); }

  onFilterCountryChange(value: string | null): void {
    this.filterCountry.set(value);
    this.applyFilters();
  }

  onFilterDateFromChange(e: Event): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onFilterDateToChange(e: Event): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  /** Fills From/To Date with a preset range (mirrors the Business list page's quick date presets). */
  applyQuickDatePreset(preset: 'today' | '7d' | '30d'): void {
    const today = new Date();
    const to = this.toInputDate(today);

    if (preset === 'today') {
      this.filterDateFrom.set(to);
      this.filterDateTo.set(to);
      this.activeQuickRange.set('today');
      this.applyFilters();
      return;
    }

    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - (preset === '7d' ? 6 : 29));
    this.filterDateFrom.set(this.toInputDate(fromDate));
    this.filterDateTo.set(to);
    this.activeQuickRange.set(preset);
    this.applyFilters();
  }

  private toInputDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  removeFilter(key: 'mode' | 'country' | 'dateFrom' | 'dateTo'): void {
    switch (key) {
      case 'mode':     this.modeFilter.set('all'); break;
      case 'country':  this.filterCountry.set(null); break;
      case 'dateFrom': this.filterDateFrom.set(''); break;
      case 'dateTo':   this.filterDateTo.set(''); break;
    }
    if (key === 'dateFrom' || key === 'dateTo') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.modeFilter.set('all');
    this.filterCountry.set(null);
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.showAdvancedFilters.set(false);
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page); this.loadEvents();
  }
  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let s = Math.max(1, cur - Math.floor(max / 2));
    const e = Math.min(total, s + max - 1); s = Math.max(1, e - max + 1);
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  }
  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize, this.totalItems()); }

  // ── helpers ──
  isMine(evt: AppEvent): boolean {
    const uid = this.currentUserId();
    return !!uid && (evt.userId === uid || this.isAdmin());
  }
  isNear(evt: AppEvent): boolean {
    const pin = this.userPincode();
    return !!pin && evt.eventMode !== 'Online' && evt.pincode === pin;
  }
  categoryIcon(cat?: string): string { return CATEGORY_ICON[cat ?? ''] ?? 'bi-calendar-event'; }
  categoryGradient(cat?: string): string { return CATEGORY_GRADIENT[cat ?? ''] ?? 'g-meet'; }

  relTime(dateStr: string): { label: string; cls: string; isPast: boolean } {
    const d = new Date(dateStr);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((eventDay.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { label: 'Past event', cls: 'is-past', isPast: true };
    if (days === 0) return { label: 'Today', cls: 'is-soon', isPast: false };
    if (days === 1) return { label: 'Tomorrow', cls: 'is-soon', isPast: false };
    if (days <= 14) return { label: `In ${days} days`, cls: 'is-soon', isPast: false };
    return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }), cls: '', isPast: false };
  }
  fmtTimeRange(evt: AppEvent): string {
    if (!evt.eventTime) return '';
    return evt.eventEndTime ? `${evt.eventTime} – ${evt.eventEndTime}` : evt.eventTime;
  }

  // ── detail popup ──
  viewEvent(evt: AppEvent): void { this.viewingEvent.set(evt); }
  closeView(): void { this.viewingEvent.set(null); }

  // ── image viewer ──
  openImageViewer(images: string[], index = 0): void {
    this.imageViewerImages.set(images);
    this.imageViewerInitialIndex.set(index);
    this.imageViewerOpen.set(true);
  }
  closeImageViewer(): void { this.imageViewerOpen.set(false); }

  // ── add / edit modal ──
  openAddModal(): void {
    this.editingId.set(null);
    this.eventForm.reset({ timezone: 'Asia/Kolkata', eventMode: 'Offline', pincode: this.userPincode() });
    this.formSubmitAttempted.set(false);
    this.selectedImage.set(null); this.existingImage.set(null);
    this.showAddModal.set(true);
  }
  openEditModal(evt: AppEvent): void {
    this.editingId.set(evt.id);
    this.formSubmitAttempted.set(false);
    this.eventForm.reset({
      title: evt.title,
      description: evt.description ?? '',
      eventCategory: evt.eventCategory ?? '',
      eventDate: evt.eventDate ? evt.eventDate.substring(0, 10) : '',
      eventTime: evt.eventTime ?? '',
      eventEndTime: evt.eventEndTime ?? '',
      timezone: evt.timezone ?? 'Asia/Kolkata',
      eventMode: evt.eventMode ?? 'Offline',
      address: evt.address ?? '',
      locationLink: evt.locationLink ?? '',
      pincode: evt.pincode ?? '',
      location: evt.location ?? '',
      country: evt.country ?? '',
    });
    this.selectedImage.set(null);
    this.existingImage.set(evt.images?.[0] ?? null);
    this.showAddModal.set(true);
  }
  closeAddModal(): void {
    this.showAddModal.set(false);
    this.formSubmitAttempted.set(false);
  }

  onImageChange(files: File[]): void {
    this.selectedImage.set(files[0] ?? null);
  }

  submitEvent(): void {
    this.formSubmitAttempted.set(true);
    this.eventForm.markAllAsTouched();
    if (this.eventForm.invalid) { this.scrollToFirstError(); return; }

    this.submitting.set(true);
    const data = this.eventForm.value;
    const images = this.selectedImage() ? [this.selectedImage()!] : undefined;
    const id = this.editingId();

    const editingBefore = id ? this.events().find(e => e.id === id) : undefined;
    const req$ = id ? this.eventService.updateEvent(id, data, images) : this.eventService.createEvent(data, images);
    req$.subscribe({
      next: (evt) => {
        if (evt.status === 'PENDING' && (!id || editingBefore?.status === 'REJECTED')) {
          this.loadMyPendingEventsCount();
          this.toast.success(id ? 'Event resubmitted for admin approval' : 'Event submitted for admin approval');
          if (id) {
            this.events.update(list => list.map(e => e.id === id ? evt : e));
          } else if (this.pageTab() === 'pending') {
            this.events.update(list => [evt, ...list]);
            this.totalItems.update(v => v + 1);
          }
        } else if (id) {
          this.events.update(list => list.map(e => e.id === id ? evt : e));
          this.toast.success('Event updated');
        } else {
          this.events.update(list => [evt, ...list]);
          this.totalItems.update(v => v + 1);
          this.toast.success('Event created');
        }
        this.closeAddModal(); this.submitting.set(false);
      },
      error: (err) => { this.toast.error(err?.error?.message ?? 'Failed to save event'); this.submitting.set(false); },
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

  // ── delete ──
  requestDelete(evt: AppEvent): void { this.confirmDeleteIds.set([evt.id]); }
  cancelDeleteConfirm(): void { this.confirmDeleteIds.set(null); }

  confirmDeleteExecute(): void {
    const ids = this.confirmDeleteIds();
    if (!ids || ids.length === 0) return;
    this.bulkProcessing.set(true);
    let completed = 0, succeeded = 0, failed = 0;

    const finish = () => {
      this.confirmDeleteIds.set(null); this.bulkProcessing.set(false);
      if (succeeded > 0) this.toast.success(succeeded === 1 ? 'Event deleted' : `${succeeded} events deleted`);
      if (failed > 0) this.toast.error(`${failed} event${failed === 1 ? '' : 's'} failed to delete`);

      const remainingOnPage = this.events().length - succeeded;
      if (remainingOnPage <= 0 && this.currentPage() > 1) this.currentPage.update(p => p - 1);
      this.loadEvents();
    };

    ids.forEach((id) => {
      this.eventService.deleteEvent(id).subscribe({
        next: () => { succeeded++; completed++; if (completed === ids.length) finish(); },
        error: () => { failed++; completed++; if (completed === ids.length) finish(); },
      });
    });
  }
}
