import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../../../core/services/event.service';
import { ToastService } from '../../../core/services/toast.service';
import { Event as AppEvent } from '../../../core/models';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

/**
 * The single Delete-Event confirmation popup — same red-themed chrome as
 * business-delete-modal/community-delete-modal, so every "delete" flow in
 * the app looks and behaves identically. Owns the delete call itself.
 */
@Component({
  selector: 'app-event-delete-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ScrollLockDirective],
  templateUrl: './event-delete-modal.component.html',
  styleUrls: ['./event-delete-modal.component.scss'],
})
export class EventDeleteModalComponent {
  private svc   = inject(EventService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() event: AppEvent | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the deleted event's id after a successful delete. */
  @Output() deleted = new EventEmitter<string>();

  deleting = signal(false);

  requestClose(): void {
    if (this.deleting()) return;
    this.closed.emit();
  }

  confirmDelete(): void {
    const evt = this.event;
    if (!evt) return;
    this.deleting.set(true);
    this.svc.deleteEvent(evt.id).subscribe({
      next: () => {
        this.toast.success('components.eventDelete.toastDeleted');
        this.deleting.set(false);
        this.deleted.emit(evt.id);
        this.closed.emit();
      },
      error: () => {
        this.toast.error('components.eventDelete.toastFailed');
        this.deleting.set(false);
      },
    });
  }
}
