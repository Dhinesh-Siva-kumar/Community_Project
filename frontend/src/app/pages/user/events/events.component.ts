import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
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
  selector: 'app-user-events',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe, FileUploadComponent],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class UserEventsComponent implements OnInit {
  private eventService = inject(EventService);
  private authService  = inject(AuthService);
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
  filteredEvents = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return q ? this.events().filter(e =>
      e.title.toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q)
    ) : this.events();
  });

  showAddModal     = signal(false);
  selectedImage    = signal<File | null>(null);
  imagePreview     = signal<string | null>(null);
  imageUploadReset = signal(0);

  eventForm!: FormGroup;
  userPincode = computed(() => this.authService.currentUser()?.pincode ?? '');

  readonly EVENT_TYPES = ['Workshop','Meetup','Webinar','Festival','Conference','Exhibition','Concert','Sports','Social','Other'];
  readonly EVENT_MODES = ['Offline','Online','Hybrid'] as const;
  readonly TIMEZONES   = ['UTC','Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Singapore','Australia/Sydney'];

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

  loadEvents(): void {
    this.loading.set(true);
    this.eventService.getEvents(this.userPincode()).subscribe({
      next: (res: PaginatedResponse<AppEvent>) => {
        this.events.set(res.data); this.totalPages.set(res.totalPages); this.totalItems.set(res.total); this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load events'); this.loading.set(false); },
    });
  }

  openAddModal(): void {
    this.eventForm.reset({ pincode: this.userPincode() });
    this.selectedImage.set(null); this.imagePreview.set(null);
    this.imageUploadReset.update(v => v + 1); this.showAddModal.set(true);
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
    this.eventService.createEvent(data, images).subscribe({
      next: (evt) => { this.events.update(l => [evt, ...l]); this.totalItems.update(v => v + 1); this.toast.success('Event created'); this.closeAddModal(); this.submitting.set(false); },
      error: (err) => { this.toast.error(err?.error?.message ?? 'Failed to create event'); this.submitting.set(false); },
    });
  }

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
  truncate(text: string | undefined, n: number): string { if (!text) return ''; return text.length > n ? text.substring(0,n) + '…' : text; }
}
