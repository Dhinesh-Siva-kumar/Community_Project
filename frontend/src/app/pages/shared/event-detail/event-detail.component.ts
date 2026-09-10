import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { Event as AppEvent } from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';
import { QrCodeComponent } from '../../../shared/components/qr-code/qr-code.component';
import { EVENT_CATEGORY_ICON } from '../../../shared/constants/event-categories';
import { ToastService } from '../../../core/services/toast.service';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { EventFormModalComponent } from '../../../shared/components/event-form-modal/event-form-modal.component';
import { EventDeleteModalComponent } from '../../../shared/components/event-delete-modal/event-delete-modal.component';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Dedicated, routed Event Details page (`/admin/events/:id`, `/user/events/:id`)
 * — replaces the old `event-detail-modal` popup so an event has a real,
 * linkable/shareable URL. Built from that modal's fetch/format logic,
 * restructured as a full page with a back link instead of a close button.
 */
@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, ImageUrlPipe, EventDateBadgeComponent, QrCodeComponent, ImageViewerComponent, EventFormModalComponent, EventDeleteModalComponent, TranslatePipe],
  templateUrl: './event-detail.component.html',
  styleUrls: ['./event-detail.component.scss'],
})
export class EventDetailComponent implements OnInit, OnDestroy {
  private eventService = inject(EventService);
  private authService  = inject(AuthService);
  private toast        = inject(ToastService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  loading        = signal(true);
  notFound       = signal(false);
  event          = signal<AppEvent | null>(null);
  related        = signal<AppEvent[]>([]);
  relatedLoading = signal(false);

  isAdmin   = computed(() => this.authService.currentUser()?.role === 'ADMIN');
  /** Where the back link and related-event clicks go, depending on which console this page was reached from. */
  basePath  = computed(() => this.isAdmin() ? '/admin/events' : '/user/events');
  /** The host who submitted the event, or an admin, can edit/delete it from here. */
  canManage = computed(() => {
    const evt = this.event();
    if (!evt) return false;
    return this.isAdmin() || evt.userId === this.authService.currentUser()?.id;
  });

  // ── Edit / Delete — same shared modals the listing pages use. ──
  showEditModal     = signal(false);
  showDeleteConfirm = signal(false);

  openEditModal(): void { this.showEditModal.set(true); }
  closeEditModal(): void { this.showEditModal.set(false); }

  /** The form modal already fetches the full record itself; just refresh this page's copy once it saves. */
  onEventSaved(evt: AppEvent): void {
    this.event.set(evt);
    this.showEditModal.set(false);
  }

  openDeleteConfirm(): void { this.showDeleteConfirm.set(true); }
  closeDeleteConfirm(): void { this.showDeleteConfirm.set(false); }

  onEventDeleted(): void {
    this.router.navigate([this.basePath()]);
  }

  // ── Image viewer — clicking the hero photo or a thumbnail opens the
  // same full-screen lightbox the listing pages already use. ──
  imageViewerOpen  = signal(false);
  imageViewerIndex = signal(0);

  openImageViewer(index: number): void {
    this.imageViewerIndex.set(index);
    this.imageViewerOpen.set(true);
  }
  closeImageViewer(): void {
    this.imageViewerOpen.set(false);
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const id = params.get('id');
      if (id) this.loadEvent(id);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEvent(id: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.event.set(null);
    this.related.set([]);
    // Scroll to the top when navigating between two events (e.g. via Related Events).
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

    this.eventService.getEvent(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (evt) => { this.event.set(evt); this.loading.set(false); },
      error: () => { this.notFound.set(true); this.loading.set(false); },
    });
    this.relatedLoading.set(true);
    // 12 rather than the old modal's 6 — "show more events" per country and
    // worldwide visibility, not just a handful of category matches.
    this.eventService.getRelatedEvents(id, 12).pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => { this.related.set(list); this.relatedLoading.set(false); },
      error: () => { this.relatedLoading.set(false); },
    });
  }

  /** Re-targets the page at a related event without a full navigation reload. */
  viewEvent(id: string): void {
    this.router.navigate([this.basePath(), id]);
  }

  categoryIcon(cat?: string): string { return EVENT_CATEGORY_ICON[cat ?? ''] ?? 'bi-calendar-event'; }

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

  async copyBookingUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('user.events.bookingUrlCopied');
    } catch {
      this.toast.error('user.events.bookingUrlCopyFailed');
    }
  }
}
