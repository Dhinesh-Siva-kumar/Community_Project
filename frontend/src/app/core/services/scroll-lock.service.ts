import { Injectable } from '@angular/core';

/**
 * Shared background-scroll lock for every modal/popup/lightbox in the app.
 *
 * Reference-counted: lock() and unlock() calls can nest (e.g. two modal-open
 * signals flipping in the same tick, or a lightbox opened from within a
 * modal) — the background only unlocks once every caller has called
 * unlock().
 *
 * Deliberately does NOT toggle `overflow: hidden` on <html>/<body>. Doing so
 * makes the browser discard the current scroll offset the instant it's
 * applied — that's the root cause of the classic "page jumps to top when a
 * modal opens" bug. Instead this pins <body> in place with
 * `position: fixed` + a negative `top` offset equal to the current scroll
 * position, so the background never actually loses its scroll offset; on
 * unlock we just remove the fixed positioning and re-apply that offset via
 * scrollTo — no scroll ever visibly happens.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private lockCount = 0;
  private savedScrollY = 0;
  private savedBodyStyle: { position: string; top: string; left: string; right: string; width: string; paddingRight: string } | null = null;

  lock(): void {
    if (this.lockCount === 0) {
      this.applyLock();
    }
    this.lockCount++;
  }

  unlock(): void {
    if (this.lockCount === 0) return;
    this.lockCount--;
    if (this.lockCount === 0) {
      this.releaseLock();
    }
  }

  private applyLock(): void {
    const body = document.body;
    this.savedScrollY = window.scrollY || window.pageYOffset || 0;

    this.savedBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };

    // Compensate for the scrollbar disappearing so the page doesn't shift
    // sideways while locked.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    body.style.position = 'fixed';
    body.style.top = `-${this.savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  }

  private releaseLock(): void {
    const body = document.body;
    const scrollY = this.savedScrollY;
    const saved = this.savedBodyStyle;

    body.style.position = saved?.position ?? '';
    body.style.top = saved?.top ?? '';
    body.style.left = saved?.left ?? '';
    body.style.right = saved?.right ?? '';
    body.style.width = saved?.width ?? '';
    body.style.paddingRight = saved?.paddingRight ?? '';
    this.savedBodyStyle = null;

    // The page has a global `scroll-behavior: smooth` (styles.scss); the
    // object form with behavior:'auto' overrides that so restoring the
    // position snaps back instantly instead of visibly animating.
    window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
  }
}
