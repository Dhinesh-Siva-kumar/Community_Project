import { Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { GeographyService } from '../../../core/services/geography.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent, GeoCountry } from '../../../core/models';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';
import { RadioGroupComponent, RadioOption } from '../radio-group/radio-group.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { TimeInputComponent } from '../time-input/time-input.component';
import { DateInputComponent } from '../date-input/date-input.component';
import { QrCodeComponent } from '../qr-code/qr-code.component';
import { EVENT_CATEGORIES } from '../../constants/event-categories';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

function futureDateValidator(c: AbstractControl): ValidationErrors | null {
  if (!c.value) return null;
  return new Date(c.value) < new Date(new Date().toDateString()) ? { pastDate: true } : null;
}
// A single-day event is allowed to run past midnight (e.g. 22:00 -> 02:00) —
// that just means it ends the next day, not that the times are invalid. The
// only genuinely invalid combination left is a zero-length event.
function endTimeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('eventTime')?.value;
  const end   = group.get('eventEndTime')?.value;
  if (start && end && start === end) return { sameTime: true };
  return null;
}

/** Minutes since midnight for a 24h `HH:mm` string. */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export interface TimeRangeInfo {
  /** e.g. "2h 30m", "45m", "3h". */
  durationLabel: string;
  /** True when the end time is on or before the start time, i.e. it lands the next calendar day. */
  overnight: boolean;
}

/** Duration + overnight hint for the Start/End time pair, or null once either side is empty. */
function describeTimeRange(start: string, end: string): TimeRangeInfo | null {
  if (!start || !end || start === end) return null;
  const startMin = toMinutes(start);
  let endMin = toMinutes(end);
  const overnight = endMin <= startMin;
  if (overnight) endMin += 24 * 60;
  const diff = endMin - startMin;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  const durationLabel = hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`;
  return { durationLabel, overnight };
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

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'];

/**
 * The single Add/Edit Event form modal — mirrors business-form-modal's
 * contract (open / editEventId / isAdmin inputs, closed / saved outputs) so
 * the user Events page and the admin Events page share one implementation
 * instead of keeping two copies of the form in sync by hand.
 */
@Component({
  selector: 'app-event-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelectComponent, RadioGroupComponent, FileUploadComponent, TimeInputComponent, DateInputComponent, QrCodeComponent, ImageUrlPipe, TranslatePipe, ScrollLockDirective],
  templateUrl: './event-form-modal.component.html',
  styleUrls: ['./event-form-modal.component.scss'],
})
export class EventFormModalComponent implements OnChanges, OnDestroy {
  private eventService      = inject(EventService);
  private authService       = inject(AuthService);
  private geographyService  = inject(GeographyService);
  private toast             = inject(ToastService);
  private fb                = inject(FormBuilder);
  private destroy$          = new Subject<void>();

  @Input() open = false;
  @Input() editEventId: string | null = null;
  /** Rendered inside the admin console. Only affects copy — authorization stays entirely server-side. */
  @Input() isAdmin = false;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful create/update; the host is responsible for updating its own list state. */
  @Output() saved = new EventEmitter<AppEvent>();

  submitting           = signal(false);
  formSubmitAttempted  = signal(false);
  editingEvent         = signal<AppEvent | null>(null);

  selectedImage = signal<File | null>(null);
  existingImage = signal<string | null>(null);

  readonly categoryOptions: SelectOption[] = EVENT_CATEGORIES.map((t) => ({ value: t, label: t }));
  readonly timezoneOptions: SelectOption[] = TIMEZONES.map((t) => ({ value: t, label: t }));

  readonly eventModeOptions: RadioOption[] = [
    { value: 'Offline', label: 'user.events.modeOption.offline', icon: 'bi-geo-alt-fill' },
    { value: 'Online',  label: 'user.events.modeOption.online',  icon: 'bi-camera-video-fill' },
    { value: 'Hybrid',  label: 'user.events.modeOption.hybrid',  icon: 'bi-diagram-2-fill' },
  ];

  // ── Visibility — Country Based is the default (matches the DB column
  // default), reusing the same labels/copy Business and Jobs already use. ──
  readonly visibilityOptions: RadioOption[] = [
    { value: 'COUNTRY', label: 'components.businessForm.visibilityCountry', icon: 'bi-geo-alt-fill' },
    { value: 'WORLDWIDE', label: 'components.businessForm.visibilityWorldwide', icon: 'bi-globe2' },
  ];

  // ── Country (id-based, from the geography master data — same source Business/Jobs use) ──
  countries = signal<GeoCountry[]>([]);
  private countriesLoaded = false;
  countryOptions = computed<SelectOption[]>(() =>
    this.countries().map((c) => ({ value: c.id, label: `${c.flagEmoji ?? ''} ${c.name}`.trim() }))
  );

  private userPincode = computed(() => this.authService.currentUser()?.pincode ?? '');

  eventForm!: FormGroup;

  get eventMode(): string { return this.eventForm?.get('eventMode')?.value ?? ''; }
  get showAddress(): boolean      { return this.eventMode === 'Offline' || this.eventMode === 'Hybrid'; }
  get showLocationLink(): boolean { return this.eventMode === 'Online'  || this.eventMode === 'Hybrid'; }

  get f() { return this.eventForm.controls; }

  /** Duration/overnight hint below the Start/End time fields — re-evaluated each change-detection pass, which is cheap enough here. */
  protected timeRangeInfo(): TimeRangeInfo | null {
    return describeTimeRange(this.f['eventTime'].value ?? '', this.f['eventEndTime'].value ?? '');
  }

  /** Drives the QR preview box's three states so its footprint never changes size/position as the field is filled in. */
  protected bookingQrState(): 'empty' | 'invalid' | 'valid' {
    const ctrl = this.f['bookingUrl'];
    if (!ctrl.value) return 'empty';
    return ctrl.invalid ? 'invalid' : 'valid';
  }

  protected async copyBookingUrl(): Promise<void> {
    const url = this.f['bookingUrl'].value as string;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('user.events.bookingUrlCopied');
    } catch {
      this.toast.error('user.events.bookingUrlCopyFailed');
    }
  }

  constructor() {
    this.initForm();

    // Resolves the Country select for an event edited before country_id
    // existed: fall back to matching the free-text country name against the
    // now-loaded master list, once both are available. Only fires while the
    // control is still empty, so it never clobbers a value the user (or a
    // countryId already on the record) already set.
    effect(() => {
      const evt = this.editingEvent();
      const list = this.countries();
      if (!evt || !list.length) return;
      if (this.eventForm.get('countryId')?.value) return;
      const id = evt.countryId ?? list.find((c) => c.name.toLowerCase() === (evt.country ?? '').toLowerCase())?.id ?? null;
      if (id !== null) this.eventForm.get('countryId')?.setValue(id, { emitEvent: false });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.loadCountriesIfNeeded();
      if (this.editEventId) {
        this.loadForEdit(this.editEventId);
      } else {
        this.resetForCreate();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
      countryId:    [null],
      // Country Based is the default, matching the DB column default.
      visibilityType: ['COUNTRY', Validators.required],
      // Optional — attendees can scan the QR (rendered live from this value) or follow the link.
      bookingUrl:   ['', [Validators.pattern(/^https?:\/\/.+/), Validators.maxLength(500)]],
    }, { validators: endTimeValidator });

    this.applyModeValidators(this.eventForm.get('eventMode')!.value);
    this.eventForm.get('eventMode')!.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((mode) => this.applyModeValidators(mode));
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

  private loadCountriesIfNeeded(): void {
    if (this.countriesLoaded) return;
    this.countriesLoaded = true;
    this.geographyService.getCountries().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => this.countries.set(data),
      error: () => {},
    });
  }

  private resetForCreate(): void {
    this.editingEvent.set(null);
    this.eventForm.reset({ timezone: 'Asia/Kolkata', eventMode: 'Offline', pincode: this.userPincode(), visibilityType: 'COUNTRY' });
    this.formSubmitAttempted.set(false);
    this.selectedImage.set(null);
    this.existingImage.set(null);
    this.applyModeValidators('Offline');
  }

  private loadForEdit(id: string): void {
    this.eventService.getEvent(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (evt) => this.applyEditFormData(evt),
      error: () => { this.toast.error('Failed to load event details'); this.closed.emit(); },
    });
  }

  private applyEditFormData(evt: AppEvent): void {
    this.editingEvent.set(evt);
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
      countryId: evt.countryId ?? null,
      visibilityType: evt.visibilityType ?? 'COUNTRY',
      bookingUrl: evt.bookingUrl ?? '',
    });
    this.applyModeValidators(this.eventForm.get('eventMode')!.value);

    this.selectedImage.set(null);
    this.existingImage.set(evt.images?.[0] ?? null);
  }

  onImageChange(files: File[]): void {
    this.selectedImage.set(files[0] ?? null);
  }

  requestClose(): void {
    this.closed.emit();
  }

  submitEvent(): void {
    this.formSubmitAttempted.set(true);
    this.eventForm.markAllAsTouched();
    if (this.eventForm.invalid) { this.scrollToFirstError(); return; }

    this.submitting.set(true);
    const raw: Record<string, any> = { ...this.eventForm.value };

    // Resolve the country NAME string for the backward-compat display
    // column, alongside the id-based countryId already in `raw` from the form.
    const foundCountry = this.countries().find((c) => String(c.id) === String(raw['countryId']));
    if (foundCountry) raw['country'] = foundCountry.name;

    const images = this.selectedImage() ? [this.selectedImage()!] : undefined;
    const editing = this.editingEvent();
    const req$ = editing
      ? this.eventService.updateEvent(editing.id, raw, images)
      : this.eventService.createEvent(raw, images);

    req$.subscribe({
      next: (evt) => {
        if (evt.status === 'PENDING' && (!editing || editing.status === 'REJECTED' || editing.status === 'NEEDS_INFO')) {
          this.toast.success(editing ? 'Event resubmitted for admin approval' : 'Event submitted for admin approval');
        } else if (editing) {
          this.toast.success('user.events.toast.eventUpdated');
        } else {
          this.toast.success('user.events.toast.eventCreated');
        }
        this.submitting.set(false);
        this.saved.emit(evt);
        this.closed.emit();
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
}
