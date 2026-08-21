import { Injectable } from '@angular/core';

const PENDING_KEY_PREFIX = 'welcome_banner_pending_';

/**
 * Tracks whether a user still owes a one-time onboarding moment (currently:
 * the post-registration welcome banner). Registration marks it pending;
 * the dashboard shows it once and dismisses it permanently — before that,
 * the flag simply doesn't exist, so existing users never see it retroactively.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  markWelcomePending(userId: number | string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`${PENDING_KEY_PREFIX}${userId}`, '1');
  }

  shouldShowWelcome(userId: number | string): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`${PENDING_KEY_PREFIX}${userId}`) === '1';
  }

  dismissWelcome(userId: number | string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${PENDING_KEY_PREFIX}${userId}`);
  }
}
