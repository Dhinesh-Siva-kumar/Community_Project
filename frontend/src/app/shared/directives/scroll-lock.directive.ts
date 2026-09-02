import { Directive, OnDestroy, effect, inject, input } from '@angular/core';
import { ScrollLockService } from '../../core/services/scroll-lock.service';

/**
 * Locks background page scroll while the host popup is open.
 *
 * Two usage shapes, covering how popups are built in this app:
 *  - Bare attribute — `<div class="my-modal-backdrop" appScrollLock>` —
 *    for the common case of a popup only ever rendered via
 *    `@if (open) { ... }`: locks as soon as the element is created and
 *    unlocks when Angular destroys it (the popup closing).
 *  - Bound — `<div [appScrollLock]="isOpen()">` — for a popup component
 *    that stays mounted and toggles visibility with a CSS class instead
 *    (e.g. the image lightbox): the lock follows the expression instead
 *    of the element's lifecycle.
 */
@Directive({
  selector: '[appScrollLock]',
  standalone: true,
})
export class ScrollLockDirective implements OnDestroy {
  private readonly scrollLock = inject(ScrollLockService);

  readonly appScrollLock = input<boolean | ''>('');

  private isLocked = false;

  constructor() {
    effect(() => this.setLocked(this.appScrollLock() !== false));
  }

  private setLocked(shouldLock: boolean): void {
    if (shouldLock === this.isLocked) return;
    this.isLocked = shouldLock;
    if (shouldLock) this.scrollLock.lock();
    else this.scrollLock.unlock();
  }

  ngOnDestroy(): void {
    this.setLocked(false);
  }
}
