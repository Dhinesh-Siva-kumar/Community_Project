import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { User } from '../../../core/models';
import { ProfileAvatarComponent } from '../profile-avatar/profile-avatar.component';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalizedDatePipe } from '../../pipes/localized-date.pipe';

@Component({
  selector: 'app-profile-header',
  standalone: true,
  imports: [CommonModule, DatePipe, ProfileAvatarComponent, TranslatePipe, LocalizedDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-header.component.html',
  styleUrls: ['./profile-header.component.scss'],
})
export class ProfileHeaderComponent {
  @Input() user: User | null = null;
  @Input() editMode = false;
  @Output() avatarChange = new EventEmitter<File[]>();

  get displayName(): string {
    return this.user?.displayName || this.user?.userName || '';
  }

  get isAdmin(): boolean {
    return this.user?.role === 'ADMIN';
  }
}
