import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Locks/unlocks page scroll behind an open popup (modal, drawer, panel,
 * lightbox, ...). Reference-counted so multiple popups open at once — e.g.
 * a confirm dialog stacked on top of a form modal — only restore scroll
 * once every one of them has closed, instead of the last one to close
 * unlocking scroll while another is still open underneath.
 *
 * Used via {@link ScrollLockDirective} (`appScrollLock`) rather than
 * calling this directly from component code.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private lockCount = 0;
  private previousOverflow = '';

  lock(): void {
    if (!this.isBrowser) return;
    if (this.lockCount === 0) {
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    this.lockCount++;
  }

  unlock(): void {
    if (!this.isBrowser) return;
    if (this.lockCount === 0) return;
    this.lockCount--;
    if (this.lockCount === 0) {
      document.body.style.overflow = this.previousOverflow;
    }
  }
}
