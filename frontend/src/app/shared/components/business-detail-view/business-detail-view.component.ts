import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';

import type { Business } from '../../../core/models';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { OpeningHoursDisplayComponent } from '../opening-hours-display/opening-hours-display.component';
import { InlineSpinnerComponent } from '../inline-spinner/inline-spinner.component';
import { LanguageService } from '../../../core/services/language.service';
import { TranslationService } from '../../../core/services/translation.service';
import { DAY_KEYS, isOpenNow } from '../../utils/opening-hours';

/** One of the three image categories, as rendered by the template. */
interface GallerySection {
  key: 'menu' | 'card' | 'gallery';
  num: string;
  icon: string;
  titleKey: string;
  emptyKey: string;
  images: string[];
  /** Caption shown under each thumbnail — index is 0-based. */
  caption: (index: number, total: number) => string;
  /** Small muted line under the caption — only the business-card single-image case uses this. */
  subtitle: (index: number, total: number) => string | null;
}

/**
 * The full read-only Business record, in five clearly separated sections:
 * Business Information, Opening Days & Hours, Menu Card Images, Business
 * Card Images and Gallery Photos.
 *
 * Shared by the user Business page and the admin console, which used to
 * carry two near-identical copies of this markup. Each host keeps its own
 * breadcrumb, hero and action bar (they genuinely differ) and owns the
 * lightbox — this component just reports which image was clicked.
 */
@Component({
  selector: 'app-business-detail-view',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ImageUrlPipe, OpeningHoursDisplayComponent, InlineSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './business-detail-view.component.html',
  styleUrls: ['./business-detail-view.component.scss'],
})
export class BusinessDetailViewComponent {

  private sanitizer = inject(DomSanitizer);
  private translate = inject(TranslateService);
  language = inject(LanguageService);
  private translationService = inject(TranslationService);

  readonly business = input.required<Business>();

  /** Opens the host page's lightbox on the clicked image. */
  readonly imagePreview = output<{ images: string[]; index: number }>();

  isTranslatingDescription = signal(false);
  private translatedDescription = signal<string | null>(null);

  constructor() {
    effect(() => {
      const version = this.language.languageVersion();
      const isTamil = this.language.isTamil();
      const description = this.business().description;
      if (!isTamil || !description) {
        this.translatedDescription.set(null);
        return;
      }
      this.isTranslatingDescription.set(true);
      this.translationService.translateFields({ description }, 'ta')
        .pipe(finalize(() => this.isTranslatingDescription.set(false)))
        .subscribe((translated) => {
          if (this.language.languageVersion() !== version) return;
          this.translatedDescription.set(translated['description'] ?? description);
        });
    });
  }

  /** Read path the template uses instead of `business().description` directly. */
  displayDescription(): string | undefined {
    return this.translatedDescription() ?? this.business().description ?? undefined;
  }

  protected hasContact = computed(() => {
    const b = this.business();
    return !!(b.phone || b.email || b.website || b.whatsapp);
  });

  protected hasLocation = computed(() => {
    const b = this.business();
    return !!(b.address || b.city || b.state || b.country || b.pincode);
  });

  protected hasStructuredHours = computed(() => {
    const j = this.business().openingHoursJson;
    return !!j?.days && DAY_KEYS.some((k) => j.days[k]);
  });

  /** Device-clock based, same assumption as the "Open now" filter. */
  protected isOpenNow = computed(() => isOpenNow(this.business().openingHoursJson));

  /**
   * The three image categories, always all three — each renders its own
   * empty state rather than disappearing, so the sections stay visibly
   * separated whatever the business happens to have uploaded.
   */
  protected galleries = computed<GallerySection[]>(() => {
    const b = this.business();
    const menuLabel = this.translate.instant('components.businessDetail.menuCard');
    const cardLabel = this.translate.instant('components.businessDetail.businessCard');
    return [
      {
        key: 'menu', num: '03', icon: 'bi-card-list',
        titleKey: 'components.businessDetail.menuCardImages',
        emptyKey: 'components.businessDetail.noMenuImages',
        images: b.menuImages ?? [],
        caption: (i) => `${menuLabel} #${i + 1}`,
        subtitle: () => null,
      },
      {
        key: 'card', num: '04', icon: 'bi-credit-card-2-front',
        titleKey: 'components.businessDetail.businessCardImages',
        emptyKey: 'components.businessDetail.noCardImages',
        images: b.cardImages ?? [],
        // A lone business card reads better as "<name> Official Card" than
        // "Business Card #1" — the plural naming only kicks in once there's
        // actually more than one to tell apart.
        caption: (i, total) => total === 1
          ? this.translate.instant('components.businessDetail.officialCard', { name: b.name })
          : `${cardLabel} #${i + 1}`,
        subtitle: (_i, total) => total === 1
          ? this.translate.instant('components.businessDetail.officialCardSubtitle')
          : null,
      },
      {
        key: 'gallery', num: '05', icon: 'bi-images',
        titleKey: 'components.businessDetail.galleryPhotos',
        emptyKey: 'components.businessDetail.noGalleryPhotos',
        images: b.images ?? [],
        caption: (i) => this.translate.instant('components.businessDetail.photoNumber', { n: i + 1 }),
        subtitle: () => null,
      },
    ];
  });

  // ── Map preview card ──────────────────────────────────────────
  // A plain `maps.google.com/maps?...&output=embed` iframe — the classic
  // embed form that needs no API key, unlike the JS Maps SDK or the newer
  // Embed API. Lat/lng is preferred when available (exact pin); otherwise
  // falls back to the free-text address.
  private mapQuery = computed(() => {
    const b = this.business();
    if (b.latitude != null && b.longitude != null) return `${b.latitude},${b.longitude}`;
    return [b.address, b.city, b.state, b.country].filter(Boolean).join(', ') || null;
  });

  protected mapEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const q = this.mapQuery();
    if (!q) return null;
    const url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected mapPinLabel = computed(() => {
    const b = this.business();
    return [b.city, b.pincode ? `(${b.pincode})` : null].filter(Boolean).join(' ') || b.country || '';
  });

  protected mapAddressLine = computed(() => {
    const b = this.business();
    return [b.address, b.city, b.state, b.pincode, b.country].filter(Boolean).join(', ');
  });

  protected openImage(images: string[], index: number): void {
    this.imagePreview.emit({ images, index });
  }

  protected whatsappUrl(number: string): string {
    return 'https://wa.me/' + number.replace(/\D/g, '');
  }

  /** Prefers the business's own maps link, else directions to its coordinates/address. */
  protected mapsUrl = computed(() => {
    const b = this.business();
    if (b.mapsLink) return b.mapsLink;
    if (b.latitude && b.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;
    }
    if (b.address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}`;
    }
    return '#';
  });

  protected hasOwnMapsLink = computed(() => !!this.business().mapsLink);

  /**
   * `mailto:` links ignore `target="_blank"` in every major browser — the OS
   * mail handler is launched in-place instead of a real new tab. Opening a
   * blank tab first and pointing *that* tab at `mailto:` is the only
   * reliable way to leave this page's tab untouched.
   */
  protected openMailto(email: string, event: Event): void {
    event.preventDefault();
    const win = window.open('', '_blank');
    if (win) {
      win.opener = null;
      win.location.href = 'mailto:' + email;
    } else {
      window.location.href = 'mailto:' + email;
    }
  }
}
