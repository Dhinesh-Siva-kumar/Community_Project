import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, PaginatedResponse, Country } from '../../../core/models';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { RadioGroupComponent, RadioOption } from '../../../shared/components/radio-group/radio-group.component';
import { TimeInputComponent } from '../../../shared/components/time-input/time-input.component';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { DateInputComponent } from '../../../shared/components/date-input/date-input.component';

// Remembers the last selected view mode (grid/table) across navigations.
const VIEW_STORAGE_KEY = 'admin-events:viewMode';

/** Every column the table view can sort by (all but Actions). */
type EventSortField = 'name' | 'eventDate' | 'joined' | 'category' | 'mode' | 'location' | 'status';

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

@Component({
  selector: 'app-admin-events',
  standalone: true,
  imports: [DateInputComponent, CommonModule, ReactiveFormsModule, FormsModule, DatePipe, RouterLink, FileUploadComponent, ImageErrorHandlerDirective, SearchableSelectComponent, RadioGroupComponent, TimeInputComponent, SortBarComponent, ImageUrlPipe],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
  // Pushes the page's own content left (see :host in the scss) while the
  // Advanced Filters drawer is open, instead of letting the fixed-position
  // drawer just sit on top of — and hide — the right edge of the events list.
  host: { '[class.jb-adv-open]': 'showAdvancedFilters()' },
})
export class AdminEventsComponent implements OnInit, OnDestroy {
  private eventService = inject(EventService);
  private authService = inject(AuthService);
  private layoutService = inject(LayoutService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  constructor() {
    // Lock background scroll while the add/edit or delete-confirm modal is open.
    effect(() => {
      document.body.style.overflow = (this.showAddModal() || this.showDeleteConfirm()) ? 'hidden' : '';
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.layoutService.forceSidebarCollapsed.set(false);
  }

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
  // Gates the full-page skeleton — true only until the very first fetch
  // resolves, then stays true forever after. Later fetches (stat-card
  // click, search, filter, sort) still flip `loading`, but the stats bar /
  // results meta / list stay mounted throughout instead of unmounting into
  // a skeleton and back, which read as the whole page blinking.
  pageReady  = signal(false);
  submitting = signal(false);
  skeletons  = Array(6);

  // Floating header action (shows once scrolled past the page header)
  showHeaderFab = signal(false);
  private scrollTicking = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.showHeaderFab.set(window.scrollY >= 120);
      this.scrollTicking = false;
    });
  }

  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  searchQuery = signal('');
  filterCountry  = signal('');
  filterStatus   = signal<'upcoming' | 'completed' | ''>('');
  filterEventMode = signal<'Offline' | 'Online' | 'Hybrid' | ''>('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  activeQuickRange = signal<'today' | '7d' | '30d' | null>(null);
  private searchDebounce: any = null;

  // Premium filter UI state
  showAdvancedFilters = signal(false);
  viewMode = signal<'grid' | 'table'>('grid');

  filterCountryOptions: SelectOption[] = [];
  readonly statusFilterOptions: SelectOption[] = [
    { value: '',          label: 'All Status' },
    { value: 'upcoming',  label: 'Upcoming' },
    { value: 'completed', label: 'Completed' },
  ];
  readonly pageSizeOptions: SelectOption[] = [
    { value: 20,  label: '20' },
    { value: 50,  label: '50' },
    { value: 100, label: '100' },
  ];
  pageSize = signal(20);

  // ── Sort — driven by the sort-bar above the grid ────────────
  readonly sortFields: SortField[] = [
    { key: 'joined',    label: 'Created' },
    { key: 'eventDate', label: 'Event Date' },
    { key: 'name',      label: 'Name' },
  ];
  sortBy  = signal<EventSortField>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as EventSortField);
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode.set(mode);
    sessionStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  /** Toggle sort for a clickable table column header — re-clicking the same column flips direction. */
  toggleSort(field: EventSortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('desc');
    }
    this.applyFilters();
  }

  // Stat-card counts — fetched separately (see loadEventStatCounts()) so
  // each card always shows its own true total regardless of which card is
  // currently selected, instead of being derived from whatever page
  // `events()` currently holds (which — once a card filters the list — no
  // longer contains any of the OTHER cards' events, making their counts
  // collapse to 0 and making the stat bar look broken).
  totalEventsCount    = signal(0);
  upcomingEventsCount = signal(0);
  hybridEventsCount   = signal(0);
  offlineEventsCount  = signal(0);

  // Server-side filtering: component list is whatever the API returned.
  filteredEvents = computed(() => this.events());

  // Computed property: count of active filters
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchQuery()) count++;
    if (this.filterCountry()) count++;
    if (this.filterStatus()) count++;
    if (this.filterEventMode()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  showAddModal        = signal(false);
  editingEvent        = signal<AppEvent | null>(null);
  showDeleteConfirm   = signal(false);
  eventToDelete       = signal<AppEvent | null>(null);
  deleting            = signal(false);
  formSubmitAttempted = signal(false);

  selectedImage = signal<File | null>(null);

  eventForm!: FormGroup;

  readonly EVENT_TYPES = ['Workshop','Meetup','Webinar','Festival','Conference','Exhibition','Concert','Sports','Social','Other'];
  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;

  /** Event Mode radio group in the create/edit modal (app-radio-group). */
  readonly eventModeOptions: RadioOption[] = [
    { value: 'Offline', label: 'Offline', icon: 'bi-geo-alt-fill' },
    { value: 'Online',  label: 'Online',  icon: 'bi-camera-video-fill' },
    { value: 'Hybrid',  label: 'Hybrid',  icon: 'bi-diagram-2-fill' },
  ];
  readonly TIMEZONES   = [
    'UTC','Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Singapore','Australia/Sydney',
  ];

  readonly categoryOptions: SelectOption[] = this.EVENT_TYPES.map((t) => ({ value: t, label: t }));
  readonly timezoneOptions: SelectOption[] = this.TIMEZONES.map((t) => ({ value: t, label: t }));

  get eventMode(): string { return this.eventForm?.get('eventMode')?.value ?? ''; }
  get showAddress(): boolean      { return this.eventMode === 'Offline' || this.eventMode === 'Hybrid'; }
  get showLocationLink(): boolean { return this.eventMode === 'Online'  || this.eventMode === 'Hybrid'; }

  get f() {
    return this.eventForm.controls;
  }

  ngOnInit(): void { this.initForm(); this.restoreSavedViewMode(); this.loadEvents(); this.loadCountries(); }

  /** Resume the last selected grid/table view across navigations. */
  private restoreSavedViewMode(): void {
    const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'grid' || saved === 'table') this.viewMode.set(saved);
  }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({ value: c.name, label: c.name }));
      },
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
      pincode:      ['', Validators.maxLength(12)],
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

  loadEvents(): void {
    this.loading.set(true);
    this.loadEventStatCounts();
    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    if (this.searchQuery().trim()) params['search'] = this.searchQuery().trim();
    if (this.filterCountry())      params['country'] = this.filterCountry();
    if (this.filterStatus())       params['status']  = this.filterStatus();
    if (this.filterEventMode())    params['eventMode'] = this.filterEventMode();
    if (this.filterDateFrom())     params['dateFrom'] = this.filterDateFrom();
    if (this.filterDateTo())       params['dateTo']   = this.filterDateTo();

    this.eventService.getEvents(params).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data); this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total); this.loading.set(false);
        this.pageReady.set(true);
      },
      error: () => { this.toast.error('Failed to load events'); this.loading.set(false); this.pageReady.set(true); },
    });
  }

  /** Powers the four stat cards — lightweight `limit:1` calls scoped by
   * search/country only (every filter EXCEPT status/eventMode, which is
   * what the cards themselves toggle), so each count stays accurate no
   * matter which card is currently selected. */
  private loadEventStatCounts(): void {
    const base: Record<string, any> = { page: 1, limit: 1 };
    if (this.searchQuery().trim()) base['search']  = this.searchQuery().trim();
    if (this.filterCountry())      base['country'] = this.filterCountry();

    this.eventService.getEvents(base).subscribe({
      next: (res) => this.totalEventsCount.set(res.total), error: () => {},
    });
    this.eventService.getEvents({ ...base, status: 'upcoming' }).subscribe({
      next: (res) => this.upcomingEventsCount.set(res.total), error: () => {},
    });
    this.eventService.getEvents({ ...base, eventMode: 'Hybrid' }).subscribe({
      next: (res) => this.hybridEventsCount.set(res.total), error: () => {},
    });
    this.eventService.getEvents({ ...base, eventMode: 'Offline' }).subscribe({
      next: (res) => this.offlineEventsCount.set(res.total), error: () => {},
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadEvents();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }

  setCountryFilter(v: string | number): void {
    this.filterCountry.set(v as string);
    this.applyFilters();
  }

  setStatusFilter(v: string | number): void {
    this.filterStatus.set(v as 'upcoming' | 'completed' | '');
    this.applyFilters();
  }

  setEventModeFilter(mode: 'Offline' | 'Online' | 'Hybrid' | null): void {
    this.filterEventMode.set(mode ?? '');
    this.applyFilters();
  }

  /** The four stat cards (Total/Upcoming/Hybrid/Offline) all drive this one
   * derived value, so exactly one is ever selected at a time — "Upcoming"
   * reuses the existing server-side `filterStatus` ("Status" in Advanced
   * Filters) rather than a separate client-side date hack, and Hybrid/
   * Offline reuse `filterEventMode`; each setter clears the other axis so
   * they can't both be active simultaneously. */
  eventStatFilter = computed<'all' | 'upcoming' | 'hybrid' | 'offline'>(() => {
    if (this.filterStatus() === 'upcoming') return 'upcoming';
    if (this.filterEventMode() === 'Hybrid') return 'hybrid';
    if (this.filterEventMode() === 'Offline') return 'offline';
    return 'all';
  });

  /** Toggles off back to 'all' on a repeat click of the same card. */
  setEventStatFilter(value: 'all' | 'upcoming' | 'hybrid' | 'offline'): void {
    const next = this.eventStatFilter() === value ? 'all' : value;
    this.filterStatus.set(next === 'upcoming' ? 'upcoming' : '');
    this.filterEventMode.set(next === 'hybrid' ? 'Hybrid' : next === 'offline' ? 'Offline' : '');
    this.applyFilters();
  }

  onFilterDateFromChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateFrom.set(value);
    this.applyFilters();
  }

  onFilterDateToChange(value: string): void {
    this.activeQuickRange.set(null);
    this.filterDateTo.set(value);
    this.applyFilters();
  }

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

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.applyFilters();
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

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.filterCountry.set('');
    this.filterStatus.set('');
    this.filterEventMode.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.activeQuickRange.set(null);
    this.applyFilters();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'search':    this.searchQuery.set('');   break;
      case 'country':   this.filterCountry.set(''); break;
      case 'status':    this.filterStatus.set('');  break;
      case 'eventMode': this.filterEventMode.set(''); break;
      case 'dateFrom':  this.filterDateFrom.set(''); break;
      case 'dateTo':    this.filterDateTo.set('');  break;
    }
    if (key === 'dateFrom' || key === 'dateTo') this.activeQuickRange.set(null);
    this.applyFilters();
  }

  openAddModal(): void {
    this.editingEvent.set(null); this.eventForm.reset();
    this.formSubmitAttempted.set(false);
    this.selectedImage.set(null);
    this.showAddModal.set(true);
  }

  openEditModal(evt: AppEvent, event: Event): void {
    event.stopPropagation(); this.editingEvent.set(evt);
    this.formSubmitAttempted.set(false);
    this.eventForm.patchValue({
      title: evt.title, description: evt.description ?? '',
      eventCategory: (evt as any).eventCategory ?? '',
      eventDate: evt.eventDate ? evt.eventDate.substring(0, 10) : '',
      eventTime: evt.eventTime ?? '', eventEndTime: (evt as any).eventEndTime ?? '',
      timezone: (evt as any).timezone ?? 'Asia/Kolkata',
      eventMode: (evt as any).eventMode ?? 'Offline',
      address: evt.address ?? '', locationLink: (evt as any).locationLink ?? '',
      pincode: evt.pincode ?? '', location: evt.location ?? '', country: evt.country ?? '',
    });
    this.selectedImage.set(null);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editingEvent.set(null);
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
    const editing = this.editingEvent();
    const req = editing
      ? this.eventService.updateEvent(editing.id, data, images)
      : this.eventService.createEvent(data, images);
    req.subscribe({
      next: (evt) => {
        if (editing) { this.events.update(l => l.map(e => e.id === evt.id ? evt : e)); this.toast.success('Event updated'); }
        else { this.events.update(l => [evt, ...l]); this.totalItems.update(v => v + 1); this.toast.success('Event created'); }
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

  openDeleteConfirm(evt: AppEvent, event: Event): void {
    event.stopPropagation(); this.eventToDelete.set(evt); this.showDeleteConfirm.set(true);
  }
  closeDeleteConfirm(): void { this.showDeleteConfirm.set(false); this.eventToDelete.set(null); }
  confirmDelete(): void {
    const evt = this.eventToDelete(); if (!evt) return;
    this.deleting.set(true);
    this.eventService.deleteEvent(evt.id).subscribe({
      next: () => { this.events.update(l => l.filter(e => e.id !== evt.id)); this.totalItems.update(v => v - 1); this.toast.success('Event deleted'); this.closeDeleteConfirm(); this.deleting.set(false); },
      error: () => { this.toast.error('Failed to delete event'); this.deleting.set(false); },
    });
  }
  // backward compat
  deleteEvent(id: string): void { const e = this.events().find(x => x.id === id); if (e) this.openDeleteConfirm(e, new MouseEvent('click')); }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page); this.loadEvents();
  }
  getPages(): number[] {
    const total = this.totalPages(), cur = this.currentPage(), max = 5;
    let s = Math.max(1, cur - Math.floor(max/2));
    const e = Math.min(total, s + max - 1); s = Math.max(1, e - max + 1);
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  }

  showingFrom(): number { return this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1; }
  showingTo():   number { return Math.min(this.currentPage() * this.pageSize(), this.totalItems()); }
  truncate(text: string | undefined, n: number): string {
    if (!text) return ''; return text.length > n ? text.substring(0, n) + '…' : text;
  }

  getEventStatus(evt: AppEvent): { label: string; type: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(evt.eventDate);
    
    if (eventDate >= today) {
      return { label: 'Upcoming', type: 'upcoming' };
    } else {
      return { label: 'Completed', type: 'completed' };
    }
  }

  /** "09:11" → "9:11 AM" */
  private to12h(time24: string): string {
    const [h, m] = time24.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return time24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  /** "09:11" + "11:12" + "Asia/Kolkata" → "9:11 AM – 11:12 AM (Asia/Kolkata)" */
  formatEventTime(evt: AppEvent): string {
    if (!evt.eventTime) return '';
    let text = this.to12h(evt.eventTime);
    if (evt.eventEndTime) text += ' – ' + this.to12h(evt.eventEndTime);
    if (evt.timezone) text += ` (${evt.timezone})`;
    return text;
  }

  /** Address + Venue/City - Pincode, Country → "12 Main St, City Hall - 600001, India" */
  formatEventAddress(evt: AppEvent): string {
    const parts: string[] = [];
    if (evt.address) parts.push(evt.address);
    const venuePincode = [evt.location, evt.pincode].filter(Boolean).join(' - ');
    if (venuePincode) parts.push(venuePincode);
    if (evt.country) parts.push(evt.country);
    return parts.join(', ');
  }
}
