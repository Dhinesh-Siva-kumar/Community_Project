import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-profile-info-card',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-info-card.component.html',
  styleUrls: ['./profile-info-card.component.scss'],
})
export class ProfileInfoCardComponent {
  @Input() title = '';
  @Input() icon?: string;
  @Input() editMode = false;
  @Input() loading = false;
  @Input() showEdit = true;
  @Output() edit = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  /** Generic header action button (e.g. "Add Business") — same .btn-edit
   * styling as the Edit button, shown instead of it when showEdit is
   * false. Set actionLabel to enable it. */
  @Input() actionLabel?: string;
  @Input() actionIcon = 'bi-plus-lg';
  @Output() action = new EventEmitter<void>();
}
