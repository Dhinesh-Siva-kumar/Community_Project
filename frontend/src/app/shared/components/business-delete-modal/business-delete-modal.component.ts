import { Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BusinessService } from '../../../core/services/business.service';
import { ToastService } from '../../../core/services/toast.service';
import { Business } from '../../../core/models';

/**
 * The single Delete-Business confirmation popup — a straight port of the
 * admin Business page's delete confirmation modal (same red-themed chrome,
 * same copy, same behavior), so the user side gets identical design and
 * functionality. Shared by the user Business directory/detail page and the
 * profile "My Businesses" tab.
 */
@Component({
  selector: 'app-business-delete-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './business-delete-modal.component.html',
  styleUrls: ['./business-delete-modal.component.scss'],
})
export class BusinessDeleteModalComponent implements OnChanges, OnDestroy {
  private svc   = inject(BusinessService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() business: Business | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the deleted business's id after a successful delete. */
  @Output() deleted = new EventEmitter<string>();

  deleting = signal(false);

  private previousBodyOverflow: string | null = null;
  private previousHtmlOverflow: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) this.lockPageScroll();
      else this.unlockPageScroll();
    }
  }

  ngOnDestroy(): void {
    this.unlockPageScroll();
  }

  private lockPageScroll(): void {
    const body = document.body;
    const html = document.documentElement;
    if (this.previousBodyOverflow === null) this.previousBodyOverflow = body.style.overflow;
    if (this.previousHtmlOverflow === null) this.previousHtmlOverflow = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }

  private unlockPageScroll(): void {
    const body = document.body;
    const html = document.documentElement;
    body.style.overflow = this.previousBodyOverflow ?? '';
    html.style.overflow = this.previousHtmlOverflow ?? '';
    this.previousBodyOverflow = null;
    this.previousHtmlOverflow = null;
  }

  requestClose(): void {
    if (this.deleting()) return;
    this.closed.emit();
  }

  confirmDelete(): void {
    const biz = this.business;
    if (!biz) return;
    this.deleting.set(true);
    this.svc.deleteBusiness(biz.id).subscribe({
      next: () => {
        this.toast.success('Business deleted');
        this.deleting.set(false);
        this.deleted.emit(biz.id);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to delete business');
        this.deleting.set(false);
      },
    });
  }
}
