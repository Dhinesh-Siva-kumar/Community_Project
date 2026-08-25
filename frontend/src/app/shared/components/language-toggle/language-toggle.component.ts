import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageService } from '../../../core/services/language.service';

/**
 * App-wide EN / தமிழ் toggle for the user/admin layout headers — the language
 * counterpart to `app-theme-toggle`, wired to the shared `LanguageService`.
 *
 * Replaces the five copies of this markup that used to live in the landing and
 * auth templates, each with its own local `toggleLanguage()`.
 */
@Component({
  selector: 'app-language-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <button
      type="button"
      class="lang-toggle"
      [class.lang-toggle--block]="block()"
      (click)="languageService.toggle()"
      [attr.aria-label]="switchLabel | translate"
      [attr.title]="switchLabel | translate"
    >
      <span class="lang-toggle-seg" [class.active]="!languageService.isTamil()">EN</span>
      <span class="lang-toggle-divider" aria-hidden="true"></span>
      <span class="lang-toggle-seg" [class.active]="languageService.isTamil()">தமிழ்</span>
    </button>
  `,
  styleUrl: './language-toggle.component.scss',
})
export class LanguageToggleComponent {
  languageService = inject(LanguageService);

  /** Renders full-width, for mobile nav drawers. */
  block = input(false);

  protected get switchLabel(): string {
    return this.languageService.isTamil() ? 'common.switchToEnglish' : 'common.switchToTamil';
  }
}
