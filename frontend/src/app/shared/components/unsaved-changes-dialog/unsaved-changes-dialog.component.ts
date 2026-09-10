import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UnsavedChangesService } from '../../../core/services/unsaved-changes.service';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The one shared "You have unsaved changes" confirmation dialog — mounted
 * once at the app root (see app.component.html, same pattern as
 * `<app-toast />`) and driven entirely by UnsavedChangesService, so any
 * form in the app can prompt with it without rendering its own copy.
 */
@Component({
  selector: 'app-unsaved-changes-dialog',
  standalone: true,
  imports: [CommonModule, ScrollLockDirective, TranslatePipe],
  templateUrl: './unsaved-changes-dialog.component.html',
  styleUrls: ['./unsaved-changes-dialog.component.scss'],
})
export class UnsavedChangesDialogComponent {
  protected unsavedChanges = inject(UnsavedChangesService);

  stay(): void {
    this.unsavedChanges.resolve(false);
  }

  leave(): void {
    this.unsavedChanges.resolve(true);
  }
}
