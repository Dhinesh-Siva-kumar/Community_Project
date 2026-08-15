import { Directive, ElementRef, EventEmitter, NgZone, OnDestroy, OnInit, Output, inject, input } from '@angular/core';

/**
 * Attach to a sentinel element at the end of a lazily-rendered list; emits
 * `nearEnd` once when the sentinel scrolls into view, so the caller can
 * reveal/fetch the next batch. `rootMargin` triggers the load a bit before
 * the sentinel is fully in view for a smoother feel.
 */
@Directive({
  selector: '[appInfiniteScroll]',
  standalone: true,
})
export class InfiniteScrollDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private zone = inject(NgZone);
  private observer: IntersectionObserver | null = null;

  rootMargin = input<string>('300px');

  @Output() nearEnd = new EventEmitter<void>();

  ngOnInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.zone.run(() => this.nearEnd.emit());
        }
      },
      { rootMargin: this.rootMargin() }
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
