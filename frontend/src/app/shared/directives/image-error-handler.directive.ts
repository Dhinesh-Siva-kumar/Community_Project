import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

/**
 * Handles image loading errors by:
 * 1. Attempting fallback URLs if provided
 * 2. Falling back to a placeholder image
 * 3. Adding error styling
 * 4. Optionally showing a toast notification
 *
 * Usage:
 * <img [src]="imageUrl" appImageError [fallback]="fallbackUrl" [showToast]="true" />
 */
@Directive({
  selector: '[appImageError]',
  standalone: true,
})
export class ImageErrorHandlerDirective implements OnInit {
  private el = inject(ElementRef);
  private toastService = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  /** Array of fallback image URLs to try before using placeholder */
  fallback = input<string | string[] | undefined>(undefined);

  /** Whether to show a toast notification when image fails to load */
  showToast = input<boolean>(false);

  /** Whether to show console warnings for debugging */
  debug = input<boolean>(false);

  // Placeholder SVG with light gray background and "Image not found" icon
  private readonly PLACEHOLDER_URL = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f0f0f0'/%3E%3Cg transform='translate(200, 150)'%3E%3Ccircle cx='0' cy='-30' r='25' fill='%23d0d0d0'/%3E%3Cpath d='M -60 20 L -20 -20 L 20 0 L 60 -40 L 60 80 L -60 80 Z' fill='%23d0d0d0'/%3E%3Ctext x='0' y='120' font-family='Arial' font-size='24' fill='%23999' text-anchor='middle'%3EImage not found%3C/text%3E%3C/g%3E%3C/svg%3E`;

  private attemptCount = 0;
  private fallbackUrls: string[] = [];

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Prepare fallback URLs
    const fallback = this.fallback();
    if (fallback) {
      this.fallbackUrls = Array.isArray(fallback) ? fallback : [fallback];
    }
  }

  @HostListener('error')
  onError(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const img = this.el.nativeElement as HTMLImageElement;
    this.attemptCount++;

    if (this.debug()) {
      console.warn(
        `[ImageErrorHandler] Image failed to load. Attempt: ${this.attemptCount}`,
        { src: img.src, fallbackUrls: this.fallbackUrls }
      );
    }

    // Try next fallback URL if available
    if (this.attemptCount <= this.fallbackUrls.length) {
      const fallbackUrl = this.fallbackUrls[this.attemptCount - 1];
      if (fallbackUrl) {
        img.src = fallbackUrl;
        if (this.debug()) {
          console.log(
            `[ImageErrorHandler] Trying fallback URL: ${fallbackUrl}`
          );
        }
        return;
      }
    }

    // Use placeholder as final fallback
    this.useImageError(img);
  }

  private useImageError(img: HTMLImageElement): void {
    img.src = this.PLACEHOLDER_URL;
    img.classList.add('image-error');
    img.title = 'Image not available';

    if (this.debug()) {
      console.warn(
        `[ImageErrorHandler] Using placeholder for image: ${img.alt || 'unknown'}`
      );
    }

    // Show toast notification if enabled
    if (this.showToast()) {
      this.toastService.warning('Image not available');
    }
  }
}
