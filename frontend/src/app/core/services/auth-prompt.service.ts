import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

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

  prompt(message?: string): void {
    this.open.set({ message, returnUrl: this.router.url });
  }

  dismiss(): void {
    this.open.set(null);
  }
}
