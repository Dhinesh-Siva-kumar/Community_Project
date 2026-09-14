import { Component, Input, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Static "you're not registered/logged in" block shown in place of a page's
 * real content when a guest lands on an account-gated list/detail page
 * (jobs, business, events, community) — the route itself stays reachable
 * (no redirect), it just never loads or renders any real data for a guest.
 */
@Component({
  selector: 'app-guest-gate',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="guest-gate">
      <div class="guest-gate__icon"><i class="bi {{ icon }}"></i></div>
      <h3 class="guest-gate__title">{{ title }}</h3>
      <p class="guest-gate__message">{{ message }}</p>
      <div class="guest-gate__actions">
        <a class="guest-gate__primary" routerLink="/auth/register" [queryParams]="{ returnUrl: router.url }">
          {{ 'home.authPrompt.joinButton' | translate }}
        </a>
        <a class="guest-gate__secondary" routerLink="/auth/login" [queryParams]="{ returnUrl: router.url }">
          {{ 'home.authPrompt.loginButton' | translate }}
        </a>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../assets/styles/index' as *;

    .guest-gate {
      display: flex; flex-direction: column; align-items: center; text-align: center;
      max-width: 420px; margin: $spacing-4xl auto; padding: $spacing-xl;
    }
    .guest-gate__icon {
      width: 72px; height: 72px; border-radius: $radius-full; background: $color-primary-light;
      display: flex; align-items: center; justify-content: center; margin-bottom: $spacing-lg;
      .bi { font-size: 28px; color: $color-primary-dark; }
    }
    .guest-gate__title {
      font-family: $font-family-header; font-size: $font-size-xl; font-weight: $font-weight-bold;
      color: $color-text-primary; margin: 0 0 $spacing-xs;
    }
    .guest-gate__message { color: $color-text-muted; font-size: $font-size-sm; margin: 0 0 $spacing-lg; }
    .guest-gate__actions { display: flex; gap: $spacing-sm; flex-wrap: wrap; justify-content: center; }
    .guest-gate__primary {
      background: $gradient-primary; color: $color-on-primary; border: none; border-radius: $radius-full;
      padding: $spacing-sm $spacing-xl; font-weight: $font-weight-semibold; text-decoration: none;
      box-shadow: $shadow-primary-sm; transition: box-shadow $duration-short $easing-standard;
      &:hover { box-shadow: $shadow-primary-md; }
    }
    .guest-gate__secondary {
      background: none; border: 1px solid $color-border; border-radius: $radius-full;
      padding: $spacing-sm $spacing-xl; font-weight: $font-weight-semibold; color: $color-text-body;
      text-decoration: none; transition: background $duration-short $easing-standard;
      &:hover { background: $color-bg-hover; }
    }
  `],
})
export class GuestGateComponent {
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) title!: string;
  @Input({ required: true }) message!: string;

  router = inject(Router);
}
