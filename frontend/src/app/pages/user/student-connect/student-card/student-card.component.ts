import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { StudentDirectoryEntry } from '../../../../core/models';

/**
 * Minimal-editorial student directory card (STUDENT_CONNECT_SPEC.md §5.2):
 * no color panel, no pill badges — a small avatar, name/course, a
 * verification dot (filled green / dashed amber — shape differs, not just
 * color), plain-text location/university/languages, mentor status, and a
 * text-link "View Profile" CTA.
 */
@Component({
  selector: 'app-student-card',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './student-card.component.html',
  styleUrls: ['./student-card.component.scss'],
})
export class StudentCardComponent {
  @Input({ required: true }) profile!: StudentDirectoryEntry;

  @Output() viewProfile = new EventEmitter<string>();
  @Output() toggleSave = new EventEmitter<string>();

  get initial(): string {
    return (this.profile.firstName || '?').charAt(0).toUpperCase();
  }

  get locationLabel(): string {
    const city = this.profile.cityFreeText;
    const country = this.profile.countryName;
    return [city, country].filter(Boolean).join(', ');
  }

  onView(): void {
    this.viewProfile.emit(this.profile.userId);
  }

  onSave(event: Event): void {
    event.stopPropagation();
    this.toggleSave.emit(this.profile.userId);
  }
}
