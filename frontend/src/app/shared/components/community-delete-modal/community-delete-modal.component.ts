import { Component, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommunityService } from '../../../core/services/community.service';
import { ToastService } from '../../../core/services/toast.service';
import { Community } from '../../../core/models';

/**
 * The single Delete-Community confirmation popup — a straight port of the
 * admin Community page's delete confirmation modal (same red-themed chrome,
 * same copy, same behavior), so the user side gets identical design and
 * functionality. Shared by the user Community list page, the community
 * detail page, and the profile "My Communities" tab.
 */
@Component({
  selector: 'app-community-delete-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './community-delete-modal.component.html',
  styleUrls: ['./community-delete-modal.component.scss'],
})
export class CommunityDeleteModalComponent implements OnChanges, OnDestroy {
  private svc   = inject(CommunityService);
  private toast = inject(ToastService);

  @Input() open = false;
  @Input() community: Community | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Emitted with the deleted community's id after a successful delete. */
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
    const community = this.community;
    if (!community) return;
    this.deleting.set(true);
    this.svc.deleteCommunity(community.id).subscribe({
      next: () => {
        this.toast.success('Community deleted successfully');
        this.deleting.set(false);
        this.deleted.emit(community.id);
        this.closed.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Failed to delete community');
        this.deleting.set(false);
      },
    });
  }
}
