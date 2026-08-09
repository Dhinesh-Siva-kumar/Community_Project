import { Component, OnInit, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, PaginatedResponse, Country } from '../../../core/models';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ImageErrorHandlerDirective } from '../../../shared/directives/image-error-handler.directive';
import { SelectOption, SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SortBarComponent, SortField, SortChange, SortDir } from '../../../shared/components/sort-bar/sort-bar.component';

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

@Component({
  selector: 'app-admin-events',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe, FileUploadComponent, ImageErrorHandlerDirective, SearchableSelectComponent, SortBarComponent],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class AdminEventsComponent implements OnInit {
  private eventService = inject(EventService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
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
  filterStatus   = signal<'active' | 'inactive' | ''>('');
  filterDateFrom = signal('');
  filterDateTo   = signal('');
  private searchDebounce: any = null;

  // Premium filter UI state
  showAdvancedFilters = signal(false);

  filterCountryOptions: SelectOption[] = [];
  readonly statusFilterOptions: SelectOption[] = [
    { value: '',         label: 'All Status' },
    { value: 'active',   label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
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
  sortBy  = signal<'joined' | 'eventDate' | 'name'>('joined');
  sortDir = signal<SortDir>('desc');

  onSortChange(change: SortChange): void {
    this.sortBy.set(change.sortBy as 'joined' | 'eventDate' | 'name');
    this.sortDir.set(change.sortDir);
    this.applyFilters();
  }

  // Statistics (server-supplied page only — a lightweight "on this page" read)
  upcomingEvents = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.events().filter(e => new Date(e.eventDate) >= today).length;
  });
  hybridEvents = computed(() => this.events().filter(e => e.eventMode === 'Hybrid').length);
  offlineEvents = computed(() => this.events().filter(e => e.eventMode === 'Offline').length);

  // Server-side filtering: component list is whatever the API returned.
  filteredEvents = computed(() => this.events());

  // Computed property: count of active filters
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchQuery()) count++;
    if (this.filterCountry()) count++;
    if (this.filterStatus()) count++;
    if (this.filterDateFrom()) count++;
    if (this.filterDateTo()) count++;
    return count;
  });

  showAddModal      = signal(false);
  editingEvent      = signal<AppEvent | null>(null);
  showDeleteConfirm = signal(false);
  eventToDelete     = signal<AppEvent | null>(null);
  deleting          = signal(false);

  selectedImage    = signal<File | null>(null);
  imagePreview     = signal<string | null>(null);
  imageUploadReset = signal(0);

  eventForm!: FormGroup;

  readonly EVENT_TYPES = ['Workshop','Meetup','Webinar','Festival','Conference','Exhibition','Concert','Sports','Social','Other'];
  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;
  readonly TIMEZONES   = [
    'UTC','Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Singapore','Australia/Sydney',
  ];

  get eventMode(): string { return this.eventForm?.get('eventMode')?.value ?? ''; }
  get showAddress(): boolean      { return this.eventMode === 'Offline' || this.eventMode === 'Hybrid'; }
  get showLocationLink(): boolean { return this.eventMode === 'Online'  || this.eventMode === 'Hybrid'; }

  ngOnInit(): void { this.initForm(); this.loadEvents(); this.loadCountries(); }

  loadCountries(): void {
    this.authService.getCountries().subscribe({
      next: (res) => {
        this.filterCountryOptions = res.data.map((c: Country) => ({ value: c.name, label: c.name }));
      },
    });
  }

  private initForm(): void {
    this.eventForm = this.fb.group({
      title:        ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      description:  ['', [Validators.required, Validators.minLength(10)]],
      eventCategory:['', Validators.required],
      eventDate:    ['', [Validators.required, futureDateValidator]],
      eventTime:    ['', Validators.required],
      eventEndTime: [''],
      timezone:     ['Asia/Kolkata', Validators.required],
      eventMode:    ['Offline', Validators.required],
      address:      ['', Validators.required], // Start with required for Offline default
      locationLink: [''],
      pincode:      [''],
      location:     [''],
      country:      [''],
    }, { validators: endTimeValidator });

    // Update conditional required validators when mode changes
    this.eventForm.get('eventMode')!.valueChanges.subscribe(mode => {
      const addr = this.eventForm.get('address')!;
      const link = this.eventForm.get('locationLink')!;
      
      if (mode === 'Offline') {
        addr.setValidators([Validators.required]);
        link.clearValidators();
      } else if (mode === 'Online') {
        addr.clearValidators();
        link.setValidators([Validators.required, Validators.pattern(/^https?:\/\/.+/)]);
      } else if (mode === 'Hybrid') {
        addr.setValidators([Validators.required]);
        link.setValidators([Validators.required, Validators.pattern(/^https?:\/\/.+/)]);
      }
      
      addr.updateValueAndValidity({ emitEvent: false });
      link.updateValueAndValidity({ emitEvent: false });
    });
  }

  loadEvents(): void {
    this.loading.set(true);
    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
    if (this.searchQuery().trim()) params['search'] = this.searchQuery().trim();
    if (this.filterCountry())      params['country'] = this.filterCountry();
    if (this.filterStatus())       params['status']  = this.filterStatus();
    if (this.filterDateFrom())     params['dateFrom'] = this.filterDateFrom();
    if (this.filterDateTo())       params['dateTo']   = this.filterDateTo();

    this.eventService.getEvents(params).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data); this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total); this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load events'); this.loading.set(false); },
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
    this.filterStatus.set(v as 'active' | 'inactive' | '');
    this.applyFilters();
  }

  onFilterDateFromChange(e: Event): void {
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onFilterDateToChange(e: Event): void {
    this.filterDateTo.set((e.target as HTMLInputElement).value);
    this.applyFilters();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.applyFilters();
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters.update(v => !v);
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.filterCountry.set('');
    this.filterStatus.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.applyFilters();
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'search':    this.searchQuery.set('');   break;
      case 'country':   this.filterCountry.set(''); break;
      case 'status':    this.filterStatus.set('');  break;
      case 'dateFrom':  this.filterDateFrom.set(''); break;
      case 'dateTo':    this.filterDateTo.set('');  break;
    }
    this.applyFilters();
  }

  openAddModal(): void {
    this.editingEvent.set(null); this.eventForm.reset();
    this.selectedImage.set(null); this.imagePreview.set(null);
    this.imageUploadReset.update(v => v + 1); this.showAddModal.set(true);
  }

  openEditModal(evt: AppEvent, event: Event): void {
    event.stopPropagation(); this.editingEvent.set(evt);
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
    this.imagePreview.set(evt.images?.length ? evt.images[0] : null);
    this.imageUploadReset.update(v => v + 1); this.showAddModal.set(true);
  }

  closeAddModal(): void { this.showAddModal.set(false); this.editingEvent.set(null); }

  onImageChange(files: File[]): void {
    const f = files[0] ?? null; this.selectedImage.set(f);
    if (f) { const r = new FileReader(); r.onload = e => this.imagePreview.set(e.target?.result as string); r.readAsDataURL(f); }
    else { this.imagePreview.set(null); }
  }
  clearImage(): void { this.selectedImage.set(null); this.imagePreview.set(null); this.imageUploadReset.update(v => v + 1); }

  submitEvent(): void {
    if (this.eventForm.invalid) { this.eventForm.markAllAsTouched(); return; }
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
}
