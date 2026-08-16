import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
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
export class BusinessDeleteModalComponent {
  private svc   = inject(BusinessService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() business: Business | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the deleted business's id after a successful delete. */
  @Output() deleted = new EventEmitter<string>();

  deleting = signal(false);

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
