import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { UnsavedChangesService } from '../services/unsaved-changes.service';

/** A routed page implements this when it hosts a form that can have unsaved edits (e.g. an Add/Edit modal). */
export interface CanComponentDeactivate {
  hasUnsavedChanges(): boolean;
}

/**
 * Generic "leave with unsaved changes?" route guard — covers every kind of
 * Angular-Router-driven navigation away from the current route (sidebar/
 * menu links, dashboard links, browser back/forward, programmatic
 * `router.navigate()`) in one place, rather than each page re-implementing
 * the same prompt. Apply via `canDeactivate: [unsavedChangesGuard]` on any
 * route whose component implements `CanComponentDeactivate`.
 *
 * Browser tab close/refresh isn't a route change — that's handled
 * separately by a `beforeunload` listener on the form itself, per the
 * browser's own (non-customizable) confirmation UI.
 */
export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  const unsavedChanges = inject(UnsavedChangesService);
  return unsavedChanges.confirm();
};
