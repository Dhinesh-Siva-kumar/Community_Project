import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile-progress',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="profile-progress">
      <div class="progress-track" role="progressbar"
           [attr.aria-valuenow]="percentage" aria-valuemin="0" aria-valuemax="100"
           [attr.aria-label]="'Profile ' + percentage + '% complete'">
        <div class="progress-fill" [ngClass]="colorClass" [style.width.%]="percentage"></div>
      </div>
      @if (showLabel) {
        <small class="progress-label">{{ percentage }}%</small>
      }
    </div>
  `,
  styleUrls: ['./profile-progress.component.scss'],
})
export class ProfileProgressComponent {
  @Input() percentage = 0;
  @Input() showLabel = true;

  get colorClass(): string {
    if (this.percentage >= 80) return 'progress-excellent';
    if (this.percentage >= 50) return 'progress-good';
    if (this.percentage >= 30) return 'progress-fair';
    return 'progress-poor';
  }
}
