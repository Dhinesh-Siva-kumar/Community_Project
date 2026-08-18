import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService, EventsQueryParams } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, PaginatedResponse } from '../../../core/models';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';

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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe, FileUploadComponent, ImageViewerComponent, ImageUrlPipe],
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

  readonly pageSize = 8;
  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  searchQuery = signal('');
  modeFilter  = signal<ModeFilter>('all');
  sortOption  = signal<SortOption>('near');
  private searchDebounce: any = null;

  currentUser   = computed(() => this.authService.currentUser());
  currentUserId = computed(() => this.currentUser()?.id ?? null);
  userPincode   = computed(() => this.currentUser()?.pincode ?? '');
  isAdmin       = computed(() => this.currentUser()?.role === 'ADMIN');

  // ── selection (mirrors the admin post-approval bulk-select pattern) ──
  selectionMode = signal(false);
  selectedIds   = signal<Set<string>>(new Set());
  selectedCount = computed(() => this.selectedIds().size);
  pageMineIds   = computed(() => this.events().filter((e) => this.isMine(e)).map((e) => e.id));
  allSelectedOnPage = computed(() => {
    const ids = this.pageMineIds();
    return ids.length > 0 && ids.every((id) => this.selectedIds().has(id));
  });

  // ── add / edit modal ──
  showAddModal     = signal(false);
  editingId        = signal<string | null>(null);
  selectedImage    = signal<File | null>(null);
  imagePreview     = signal<string | null>(null);
  imageUploadReset = signal(0);
  existingImage    = signal<string | null>(null);

  eventForm!: FormGroup;

  readonly EVENT_TYPES = ['Workshop','Meetup','Webinar','Festival','Conference','Exhibition','Concert','Sports','Social','Other'];
  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;
  readonly TIMEZONES   = ['UTC','Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Singapore','Australia/Sydney'];

  get eventMode(): string { return this.eventForm?.get('eventMode')?.value ?? ''; }
  get showAddress(): boolean      { return this.eventMode === 'Offline' || this.eventMode === 'Hybrid'; }
  get showLocationLink(): boolean { return this.eventMode === 'Online'  || this.eventMode === 'Hybrid'; }

  // ── detail popup ──
  viewingEvent = signal<AppEvent | null>(null);

  // ── delete confirm (single id or several, for bulk) ──
  confirmDeleteIds = signal<string[] | null>(null);
  bulkProcessing   = signal(false);

  // ── image viewer ──
  imageViewerOpen = signal(false);
  imageViewerImages = signal<string[]>([]);
  imageViewerInitialIndex = signal(0);

  ngOnInit(): void {
    this.initForm();
    this.loadEvents();
    this.route.queryParams.subscribe(params => {
      const eventId = params['eventId'];
      if (eventId) this.openEventFromQueryParam(eventId);
    });
    this.loadMyPendingEventsCount();
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
      pincode:      [this.userPincode()],
      location:     [''],
      country:      [''],
    }, { validators: endTimeValidator });

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
        this.clearSelection();
      },
      error: () => { this.toast.error('Failed to load events'); this.loading.set(false); },
    });
  }

  private clearSelection(): void { this.selectedIds.set(new Set()); }

  applyFilters(): void { this.currentPage.set(1); this.loadEvents(); }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }
  clearSearch(): void { this.searchQuery.set(''); this.applyFilters(); }
  setModeFilter(mode: ModeFilter): void { this.modeFilter.set(mode); this.applyFilters(); }
  setSortOption(opt: SortOption): void { this.sortOption.set(opt); this.applyFilters(); }

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

  // ── selection ──
  toggleSelectionMode(): void {
    this.selectionMode.update(v => !v);
    if (!this.selectionMode()) this.clearSelection();
  }
  isSelected(id: string): boolean { return this.selectedIds().has(id); }
  toggleSelect(id: string): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  toggleSelectAll(): void {
    const ids = this.pageMineIds();
    if (this.allSelectedOnPage()) {
      this.selectedIds.update(sel => { const n = new Set(sel); ids.forEach(id => n.delete(id)); return n; });
    } else {
      this.selectedIds.update(sel => { const n = new Set(sel); ids.forEach(id => n.add(id)); return n; });
    }
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
    this.selectedImage.set(null); this.imagePreview.set(null); this.existingImage.set(null);
    this.imageUploadReset.update(v => v + 1);
    this.showAddModal.set(true);
  }
  openEditModal(evt: AppEvent): void {
    this.editingId.set(evt.id);
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
    this.selectedImage.set(null); this.imagePreview.set(null);
    this.existingImage.set(evt.images?.[0] ?? null);
    this.imageUploadReset.update(v => v + 1);
    this.showAddModal.set(true);
  }
  closeAddModal(): void { this.showAddModal.set(false); }

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

  // ── delete ──
  requestDelete(evt: AppEvent): void { this.confirmDeleteIds.set([evt.id]); }
  requestDeleteSelected(): void {
    if (this.selectedCount() === 0) return;
    this.confirmDeleteIds.set(Array.from(this.selectedIds()));
  }
  cancelDeleteConfirm(): void { this.confirmDeleteIds.set(null); }

  confirmDeleteExecute(): void {
    const ids = this.confirmDeleteIds();
    if (!ids || ids.length === 0) return;
    this.bulkProcessing.set(true);
    let completed = 0, succeeded = 0, failed = 0;

    const finish = () => {
      this.confirmDeleteIds.set(null); this.bulkProcessing.set(false);
      this.selectedIds.update(sel => { const n = new Set(sel); ids.forEach(id => n.delete(id)); return n; });
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
