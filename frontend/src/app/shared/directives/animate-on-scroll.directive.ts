import { Directive, ElementRef, OnInit, OnDestroy, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

@Directive({
  selector: '[appAnimateOnScroll]',
  standalone: true,
})
export class AnimateOnScrollDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private platformId = inject(PLATFORM_ID);
  private observer: IntersectionObserver | null = null;

  /** Threshold (0-1) at which the animation triggers */
  threshold = input<number>(0.15);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      this.el.nativeElement.classList.add('visible');
      this.el.nativeElement.style.opacity = '1';
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // One-time trigger: stop observing after first intersection
            this.observer?.unobserve(entry.target);
          }
        });
      },
      {
        threshold: this.threshold(),
        rootMargin: '0px 0px -50px 0px',
      }
    );

    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
