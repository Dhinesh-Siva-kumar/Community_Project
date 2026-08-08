import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

/**
 * Emits `truncatedChange(true)` only when the host element's text is actually
 * clipped (via CSS `text-overflow`/`-webkit-line-clamp`), so callers can show
 * a "read more" affordance (tooltip, popover) solely when there's more text
 * than what's displayed — not on every item regardless of length.
 *
 * Usage:
 * <p appTruncated (truncatedChange)="isTruncated = $event">{{ text }}</p>
 */
@Directive({
  selector: '[appTruncated]',
  standalone: true,
})
export class TruncatedDirective implements AfterViewInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  readonly truncatedChange = output<boolean>();

  ngAfterViewInit(): void {
    this.check();
    this.resizeObserver = new ResizeObserver(() => this.check());
    this.resizeObserver.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private check(): void {
    const el = this.el.nativeElement;
    const isTruncated = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    this.truncatedChange.emit(isTruncated);
  }
}
