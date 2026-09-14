import { Injectable, inject, signal } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface AuthPromptContext {
  message?: string;
  returnUrl: string;
}

/**
 * Signal-based trigger for the "Join Tamilya to continue" gate. A single
 * `<app-auth-prompt-modal>` instance (hosted on HomeComponent) reads `open`
 * and renders itself when set; any guest-facing component calls `prompt()`
 * instead of letting a guarded route silently bounce the user to /auth/login.
 */
@Injectable({ providedIn: 'root' })
export class AuthPromptService {
  private router = inject(Router);

  open = signal<AuthPromptContext | null>(null);

  constructor() {
    // `open` lives on this root singleton, but its only host
    // (<app-auth-prompt-modal>) is mounted just on HomeComponent (/home).
    // If a guest triggers a prompt there and then navigates away WITHOUT
    // using the modal's own close/join/login buttons (e.g. clicking a
    // real link to /user/community, which shows its own inline
    // <app-guest-gate> instead), `open` stays truthy — HomeComponent and
    // its modal are simply destroyed, not reset. Coming back to /home
    // later then remounts the modal straight into that stale open state,
    // resurfacing a prompt for an action the guest isn't even attempting
    // anymore. Any further navigation ends whatever guarded action
    // triggered the prompt, so close it here rather than in each caller.
    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe(() => this.open.set(null));
  }

  prompt(message?: string): void {
    this.open.set({ message, returnUrl: this.router.url });
  }

  dismiss(): void {
    this.open.set(null);
  }
}
