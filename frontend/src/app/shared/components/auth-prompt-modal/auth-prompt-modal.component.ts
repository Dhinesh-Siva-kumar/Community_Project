import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollLockDirective } from '../../directives/scroll-lock.directive';
import { AuthPromptService } from '../../../core/services/auth-prompt.service';

@Component({
  selector: 'app-auth-prompt-modal',
  standalone: true,
  imports: [TranslatePipe, ScrollLockDirective],
  template: `
    @if (authPromptService.open(); as ctx) {
      <div class="auth-prompt-backdrop" appScrollLock (click)="close()">
        <div class="auth-prompt-modal" (click)="$event.stopPropagation()">
          <button type="button" class="auth-prompt-modal__close" (click)="close()" aria-label="Close">
            <i class="bi bi-x-lg"></i>
          </button>
          <h3>{{ 'home.authPrompt.title' | translate }}</h3>
          <p>{{ ctx.message || ('home.authPrompt.message' | translate) }}</p>
          <div class="auth-prompt-modal__actions">
            <button type="button" class="auth-prompt-modal__primary" (click)="join(ctx.returnUrl)">
              {{ 'home.authPrompt.joinButton' | translate }}
            </button>
            <button type="button" class="auth-prompt-modal__secondary" (click)="login(ctx.returnUrl)">
              {{ 'home.authPrompt.loginButton' | translate }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../assets/styles/index' as *;

    .auth-prompt-backdrop {
      position: fixed; inset: 0; background: $color-backdrop-dark; display: flex; align-items: center;
      justify-content: center; z-index: $z-modal-backdrop; padding: $spacing-md;
    }
    .auth-prompt-modal {
      position: relative; background: $card-bg; border-radius: $radius-lg; padding: $spacing-xl $spacing-lg;
      max-width: 380px; width: 100%; text-align: center;
      @include shadow-modal;
    }
    .auth-prompt-modal__close { position: absolute; top: $spacing-sm; right: $spacing-sm; background: none; border: none; color: $color-text-muted; cursor: pointer; }
    .auth-prompt-modal h3 { font-family: $font-family-header; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; margin: 0 0 $spacing-xs; }
    .auth-prompt-modal p { color: $color-text-muted; font-size: $font-size-sm; margin: 0 0 $spacing-lg; }
    .auth-prompt-modal__actions { display: flex; flex-direction: column; gap: $spacing-sm; }
    .auth-prompt-modal__primary {
      background: $gradient-primary; color: $color-on-primary; border: none; border-radius: $radius-full;
      padding: $spacing-sm; font-weight: $font-weight-semibold; cursor: pointer;
      box-shadow: $shadow-primary-sm;
    }
    .auth-prompt-modal__primary:hover { box-shadow: $shadow-primary-md; }
    .auth-prompt-modal__secondary {
      background: none; border: 1px solid $color-border; border-radius: $radius-full;
      padding: $spacing-sm; font-weight: $font-weight-semibold; color: $color-text-body; cursor: pointer;
    }
    .auth-prompt-modal__secondary:hover { background: $color-bg-hover; }
  `],
})
export class AuthPromptModalComponent {
  authPromptService = inject(AuthPromptService);
  private router = inject(Router);

  close(): void {
    this.authPromptService.dismiss();
  }

  join(returnUrl: string): void {
    this.authPromptService.dismiss();
    this.router.navigate(['/auth/register'], { queryParams: { returnUrl } });
  }

  login(returnUrl: string): void {
    this.authPromptService.dismiss();
    this.router.navigate(['/auth/login'], { queryParams: { returnUrl } });
  }
}
