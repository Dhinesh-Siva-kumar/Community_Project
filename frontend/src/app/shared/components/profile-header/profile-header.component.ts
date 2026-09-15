import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges, SimpleChanges, inject, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { User } from '../../../core/models';
import { ProfileAvatarComponent } from '../profile-avatar/profile-avatar.component';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalizedDatePipe } from '../../pipes/localized-date.pipe';
import { LanguageService } from '../../../core/services/language.service';
import { TranslationService } from '../../../core/services/translation.service';
import { InlineSpinnerComponent } from '../inline-spinner/inline-spinner.component';

@Component({
  selector: 'app-profile-header',
  standalone: true,
  imports: [CommonModule, DatePipe, ProfileAvatarComponent, TranslatePipe, LocalizedDatePipe, InlineSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-header.component.html',
  styleUrls: ['./profile-header.component.scss'],
})
export class ProfileHeaderComponent implements OnChanges {
  @Input() user: User | null = null;
  @Input() editMode = false;
  @Output() avatarChange = new EventEmitter<File[]>();

  language = inject(LanguageService);
  private translationService = inject(TranslationService);

  isTranslatingBio = signal(false);
  private translatedBio = signal<string | null>(null);

  constructor() {
    // Reacts to language switches even when `user` hasn't changed (the
    // common case: staying on the same profile and flipping the toggle).
    effect(() => {
      this.language.languageVersion();
      this.translateBio();
    });
  }

  get displayName(): string {
    return this.user?.displayName || this.user?.userName || '';
  }

  get isAdmin(): boolean {
    return this.user?.role === 'ADMIN';
  }

  displayBio(): string | undefined {
    return this.translatedBio() ?? this.user?.bio ?? undefined;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['user']) this.translateBio();
  }

  private translateBio(): void {
    const bio = this.user?.bio;
    if (!this.language.isTamil() || !bio) {
      this.translatedBio.set(null);
      return;
    }
    const version = this.language.languageVersion();
    this.isTranslatingBio.set(true);
    this.translationService.translateFields({ bio }, 'ta')
      .pipe(finalize(() => this.isTranslatingBio.set(false)))
      .subscribe((translated) => {
        if (this.language.languageVersion() !== version) return;
        this.translatedBio.set(translated['bio'] ?? bio);
      });
  }
}
