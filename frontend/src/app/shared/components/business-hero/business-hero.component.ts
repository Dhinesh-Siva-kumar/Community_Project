import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { Business } from '../../../core/models';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';

type HeroStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'REJECTED' | 'NEEDS_INFO';

/**
 * The business detail page's header card — logo, status/category/visibility
 * badges, name, location, and the primary action row (Call, WhatsApp,
 * Website, Directions, plus Edit/Delete for whoever can manage it).
 *
 * Shared by the user Business page and the admin console, which used to
 * each carry their own near-identical copy. The two differences between
 * them are expressed as inputs rather than forked templates:
 *   - `canManage` / `showOwnerBadge` — the user page only shows Edit/Delete
 *     and "Your Business" to the owner; the admin console always manages.
 *   - `pendingApprovalRoute` — set only by the admin console, so a
 *     PENDING/NEEDS_INFO badge becomes a link into the approval queue.
 */
@Component({
  selector: 'app-business-hero',
  standalone: true,
  imports: [CommonModule, RouterLink, ImageUrlPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-hero.component.html',
  styleUrls: ['./business-hero.component.scss'],
})
export class BusinessHeroComponent {

  readonly business = input.required<Business>();

  readonly canManage = input<boolean>(false);
  readonly showOwnerBadge = input<boolean>(false);
  readonly pendingApprovalRoute = input<any[] | null>(null);
  readonly pendingApprovalQueryParams = input<Record<string, string> | null>(null);
  /** Shows a spinner in the delete button while a delete is in flight. */
  readonly deleting = input<boolean>(false);

  readonly logoClick = output<void>();
  readonly edit = output<MouseEvent>();
  readonly delete = output<MouseEvent>();

  protected status = computed<HeroStatus>(() => {
    const b = this.business();
    if (b.status === 'PENDING') return 'PENDING';
    if (b.status === 'REJECTED') return 'REJECTED';
    if (b.status === 'NEEDS_INFO') return 'NEEDS_INFO';
    return b.isActive ? 'ACTIVE' : 'INACTIVE';
  });

  protected showReason = computed(() => {
    const s = this.status();
    return (s === 'REJECTED' || s === 'NEEDS_INFO') && !!this.business().rejectionReason;
  });

  protected fullLocation = computed(() => {
    const b = this.business();
    return [b.city, b.state, b.country].filter(Boolean).join(', ') || b.address || '';
  });

  protected directionsUrl = computed<string | null>(() => {
    const b = this.business();
    if (b.mapsLink) return b.mapsLink;
    if (b.latitude != null && b.longitude != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;
    }
    if (b.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}`;
    return null;
  });

  protected whatsappUrl(number: string): string {
    return 'https://wa.me/' + number.replace(/\D/g, '');
  }
}
