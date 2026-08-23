import { Injectable, signal } from '@angular/core';

/**
 * Cross-page layout coordination that doesn't fit any single feature module.
 * Currently just lets a page (e.g. a right-side filter drawer) ask the app
 * shell to collapse its sidebar for extra width, without the two having a
 * parent/child relationship — they only share the router outlet.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** True while any open drawer/panel wants the sidebar minimized. */
  forceSidebarCollapsed = signal(false);
}
