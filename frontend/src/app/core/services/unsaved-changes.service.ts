import { Injectable, signal } from '@angular/core';

/**
 * Root-provided, one instance for the whole app — pairs with
 * `<app-unsaved-changes-dialog />` mounted once in app.component.html
 * (same pattern as ToastService/`<app-toast />`) and with
 * `unsavedChangesGuard` (core/guards/unsaved-changes.guard.ts).
 *
 * Any form that wants "are you sure you want to leave?" protection calls
 * `confirm()` itself when it detects a close/navigate attempt while dirty
 * — this service only owns showing the one shared dialog and resolving
 * the caller's promise with the user's choice.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesService {
  readonly isOpen = signal(false);

  private pendingResolve: ((leave: boolean) => void) | null = null;

  /** Shows the dialog and resolves once the user picks Stay (false) or Leave (true). Only one prompt at a time — a second call while one is pending resolves the first as "stay". */
  confirm(): Promise<boolean> {
    this.pendingResolve?.(false);
    return new Promise<boolean>((resolve) => {
      this.pendingResolve = resolve;
      this.isOpen.set(true);
    });
  }

  /** Called by the dialog component itself — not meant to be called directly by forms. */
  resolve(leave: boolean): void {
    this.isOpen.set(false);
    this.pendingResolve?.(leave);
    this.pendingResolve = null;
  }
}
