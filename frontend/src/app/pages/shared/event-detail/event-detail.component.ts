import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { EventService } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';
import { Event as AppEvent, EventCategory } from '../../../core/models';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { EventDateBadgeComponent } from '../../../shared/components/event-date-badge/event-date-badge.component';
import { QrCodeComponent } from '../../../shared/components/qr-code/qr-code.component';
import { ToastService } from '../../../core/services/toast.service';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { EventFormModalComponent } from '../../../shared/components/event-form-modal/event-form-modal.component';
import { EventDeleteModalComponent } from '../../../shared/components/event-delete-modal/event-delete-modal.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { formatEventAddress as formatEventAddressUtil, eventLocationSummary as eventLocationSummaryUtil } from '../../../shared/utils/event-location';
import { formatEventTimeRange as formatEventTimeRangeUtil } from '../../../shared/utils/event-date-format';
import { isHttpUrl } from '../../../shared/validators/url.validator';

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
  private translate     = inject(TranslateService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  loading        = signal(true);
  notFound       = signal(false);
  event          = signal<AppEvent | null>(null);
  related        = signal<AppEvent[]>([]);
  relatedLoading = signal(false);
  // Full list (not active-only) — this event's own category may be
  // disabled/legacy and must still resolve to the correct icon.
  categories     = signal<EventCategory[]>([]);

  isAdmin   = computed(() => this.authService.currentUser()?.role === 'ADMIN');
  /** Where the back link and related-event clicks go, depending on which console this page was reached from. */
  basePath  = computed(() => this.isAdmin() ? '/admin/events' : '/user/events');

  /** The list page's search/filter/sort state, forwarded here as query
   * params when the card was clicked — handed straight back on the "back
   * to list" breadcrumb below so returning to the list restores exactly
   * the same filtered view it was reached from (no separate state store,
   * just round-tripping the URL's own query params). Read live off the
   * route snapshot (not a computed signal) since it must stay current
   * across in-place navigations between two events (e.g. via Related
   * Events), which don't recreate this component. */
  listQueryParams(): Record<string, string> {
    const out: Record<string, string> = {};
    this.route.snapshot.queryParamMap.keys.forEach((k) => {
      const v = this.route.snapshot.queryParamMap.get(k);
      if (v) out[k] = v;
    });
    return out;
  }
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
    this.router.navigate([this.basePath()], { queryParams: this.listQueryParams() });
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
    this.eventService.getCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => this.categories.set(data),
      error: () => {},
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

  /** Re-targets the page at a related event without a full navigation reload — keeps
   * whatever list query params got us here so the breadcrumb still works after browsing. */
  viewEvent(id: string): void {
    this.router.navigate([this.basePath(), id], { queryParamsHandling: 'preserve' });
  }

  categoryIcon(cat?: string): string { return this.categories().find((c) => c.name === cat)?.icon ?? 'bi-calendar-event'; }

  /** "09:11" + "11:12" → "9:11 AM – 11:12 AM" — Time Zone is shown as its
   * own separate info row now (see the Time Zone info-item in the
   * template), not appended here; keeps "Time:" and "Time Zone:" as two
   * distinct pieces of information instead of one concatenated string. */
  formatEventTime(evt: AppEvent): string {
    return formatEventTimeRangeUtil(evt.eventTime, evt.eventEndTime);
  }

  /** Address + Venue/City - Pincode, Country → "12 Main St, City Hall - 600001, India" — Offline/Hybrid only, see eventLocationSummary() for the Online-aware version. */
  formatEventAddress(evt: AppEvent): string {
    return formatEventAddressUtil(evt);
  }

  /** "Online Event · Worldwide"/"...Country Based" for Online events (never a physical address); the real address for Offline/Hybrid. Used as the dedicated "Location" row, kept separate from the Meeting/Stream Link row. */
  eventLocationSummary(evt: AppEvent): string {
    return eventLocationSummaryUtil(evt, (key) => this.translate.instant(key));
  }

  /** Gates the Book Now CTA/QR/sidebar section — a bare truthy check on
   * evt.bookingUrl isn't enough defense against a legacy/malformed
   * persisted value (new events are already validated server-side, but
   * this page has no control over what's already in the database). */
  hasValidBookingUrl(evt: AppEvent): boolean {
    return isHttpUrl(evt.bookingUrl);
  }

  /** Same reasoning as hasValidBookingUrl(), for the Join Meeting CTA / Meeting Link info row. */
  hasValidMeetingLink(evt: AppEvent): boolean {
    return isHttpUrl(evt.locationLink);
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
