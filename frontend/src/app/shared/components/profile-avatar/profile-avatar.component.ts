import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { ImageUrlPipe } from '../../pipes/image-url.pipe';
import { UPLOAD_CONFIG } from '../../../core/constants/upload.constants';

export type AvatarSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-profile-avatar',
  standalone: true,
  imports: [CommonModule, FileUploadComponent, ImageUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-avatar.component.html',
  styleUrls: ['./profile-avatar.component.scss'],
})
export class ProfileAvatarComponent {
  @Input() src: string | null | undefined = null;
  @Input() displayName = '';
  @Input() size: AvatarSize = 'md';
  @Input() editable = false;
  @Input() maxSizeMb = UPLOAD_CONFIG.MAX_FILE_SIZE_MB;
  @Output() fileSelected = new EventEmitter<File[]>();

  get initial(): string {
    return this.displayName?.charAt(0)?.toUpperCase() ?? '?';
  }
}
