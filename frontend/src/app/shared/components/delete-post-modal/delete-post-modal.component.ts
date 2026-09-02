import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';

@Component({
  selector: 'app-delete-post-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ScrollLockDirective],
  templateUrl: './delete-post-modal.component.html',
  styleUrls: ['./delete-post-modal.component.scss'],
})
export class DeletePostModalComponent {
  @Input() open = false;
  @Input() deleting = false;
  @Input() previewContent: string | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onBackdropClick(): void {
    if (this.deleting) return;
    this.cancel.emit();
  }

  onCancel(): void {
    if (this.deleting) return;
    this.cancel.emit();
  }

  onConfirm(): void {
    if (this.deleting) return;
    this.confirm.emit();
  }
}
