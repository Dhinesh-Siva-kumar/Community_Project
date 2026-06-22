import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, PaginatedResponse } from '../../../core/models';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';

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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe, FileUploadComponent],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class AdminEventsComponent implements OnInit {
  private eventService = inject(EventService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  events     = signal<AppEvent[]>([]);
  loading    = signal(true);
  submitting = signal(false);
  skeletons  = Array(6);

  currentPage = signal(1);
  totalPages  = signal(1);
  totalItems  = signal(0);

  searchQuery = signal('');
  activeFilter = signal<'all' | 'upcoming' | 'hybrid' | 'offline' | 'completed'>('all');
  sortBy = signal<'newest' | 'oldest' | 'date'>('newest');

  // Statistics
  upcomingEvents = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.events().filter(e => new Date(e.eventDate) >= today).length;
  });
  hybridEvents = computed(() => this.events().filter(e => e.eventMode === 'Hybrid').length);
  offlineEvents = computed(() => this.events().filter(e => e.eventMode === 'Offline').length);

  filteredEvents = computed(() => {
    let result = this.events();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Apply filter
    const filter = this.activeFilter();
    if (filter === 'upcoming') {
      result = result.filter(e => new Date(e.eventDate) >= today);
    } else if (filter === 'completed') {
      result = result.filter(e => new Date(e.eventDate) < today);
    } else if (filter === 'hybrid') {
      result = result.filter(e => e.eventMode === 'Hybrid');
    } else if (filter === 'offline') {
      result = result.filter(e => e.eventMode === 'Offline');
    }

    // Apply search
    const q = this.searchQuery().toLowerCase();
    if (q) {
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q)
      );
    }

    // Apply sort
    const sort = this.sortBy();
    if (sort === 'newest') {
      result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sort === 'date') {
      result = [...result].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    }

    return result;
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

  ngOnInit(): void { this.initForm(); this.loadEvents(); }

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
    this.eventService.getEvents().subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data); this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total); this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load events'); this.loading.set(false); },
    });
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

  setFilter(filter: 'all' | 'upcoming' | 'hybrid' | 'offline' | 'completed'): void {
    this.activeFilter.set(filter);
  }

  setSortBy(sort: 'newest' | 'oldest' | 'date'): void {
    this.sortBy.set(sort);
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
