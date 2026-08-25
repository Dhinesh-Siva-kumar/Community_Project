import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

/** Shared localStorage key — same one the landing/auth pages' own (now
 * migrated) toggles already used, so an existing saved preference carries
 * over instead of resetting. */
const STORAGE_KEY = 'landing-theme';

/**
 * Single source of truth for the app-wide light/dark preference. Drives
 * `document.documentElement`'s `data-theme` attribute, which the global
 * `:root` / `[data-theme='dark']` token block in `styles.scss` reacts to —
 * every component that consumes the `$color-*`/`$profile-*` design tokens
 * (themselves `var(--x, <light-fallback>)`) re-colors automatically.
 *
 * The landing page and the 4 auth pages additionally read `theme()` to
 * drive their own `@HostBinding('attr.data-theme')` (their bespoke
 * `--lp-*`/`--auth-*` palettes are `:host[data-theme]`-scoped, independent
 * of the tokens this service manages on `<html>`) — both attachments stay
 * in sync since they're driven by the same signal.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID) as object;

  /** True once a visitor has made an explicit choice (a real value sits in
   * localStorage) — distinguishes "nothing saved yet" from "saved light",
   * so per-page defaults (see applyDefaultIfUnset) only ever apply before
   * any real preference exists. */
  private hasStoredPreference = false;

  theme = signal<Theme>(this.loadInitial());

  constructor() {
    this.applyToDocument(this.theme());
  }

  toggleTheme(): void {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.hasStoredPreference = true;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    this.applyToDocument(theme);
  }

  /**
   * Lets a page apply its own "no preference saved yet" default (e.g. the
   * auth pages default to dark, the landing page and main app default to
   * light) — a no-op once any explicit choice exists anywhere in the app
   * (an earlier `setTheme`/`toggleTheme` call, this session or a past one),
   * and never itself writes to storage, so visiting one page's default
   * never overrides another page's own default on a visitor's first visit.
   */
  applyDefaultIfUnset(theme: Theme): void {
    if (this.hasStoredPreference) return;
    this.theme.set(theme);
    this.applyToDocument(theme);
  }

  private applyToDocument(theme: Theme): void {
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.setAttribute('data-theme', theme);
      // Also flips Bootstrap 5.3's own native dark-mode CSS variables —
      // our custom tokens above only cover our own hand-rolled styles;
      // this covers the many plain Bootstrap utility/component classes
      // (.text-muted, .bg-light, .btn-close, etc.) used throughout the
      // app's templates that read Bootstrap's own --bs-* variables and
      // would otherwise stay locked to light mode. Bootstrap's precompiled
      // CSS loads before styles.scss (see angular.json), so our own
      // overrides still win the cascade wherever both apply.
      document.documentElement.setAttribute('data-bs-theme', theme);
    }
  }

  private loadInitial(): Theme {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark') {
        this.hasStoredPreference = true;
        return saved;
      }
    }
    return 'light';
  }
}
