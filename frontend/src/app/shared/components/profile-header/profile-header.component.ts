import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../../core/models';
import { ProfileAvatarComponent } from '../profile-avatar/profile-avatar.component';

@Component({
  selector: 'app-profile-header',
  standalone: true,
  imports: [CommonModule, ProfileAvatarComponent],
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
