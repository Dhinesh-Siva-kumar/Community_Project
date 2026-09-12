import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { AuthPromptService } from '../../core/services/auth-prompt.service';
import { LayoutService } from '../../core/services/layout.service';
import { ImageUrlPipe } from '../../shared/pipes/image-url.pipe';
import { NotificationPanelComponent } from '../../shared/components/notification-panel/notification-panel.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageToggleComponent } from '../../shared/components/language-toggle/language-toggle.component';
import { ScrollLockDirective } from '../../shared/directives/scroll-lock.directive';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  sectionLabel?: string;
}

// Catalog keys, not display text — the template pipes them through
// `| translate`, so the header title follows the language toggle.
const ROUTE_TITLES: Record<string, string> = {
  dashboard: 'nav.dashboard',
  home:      'nav.home',
  community: 'nav.community',
  business:  'nav.business',
  events:    'nav.events',
  jobs:      'nav.jobs',
  profile:   'nav.profile',
};

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [NgClass, RouterOutlet, RouterLink, RouterLinkActive, ImageUrlPipe, NotificationPanelComponent, ThemeToggleComponent, LanguageToggleComponent, ScrollLockDirective, TranslatePipe],
  templateUrl: './user-layout.component.html',
  styleUrls: ['./user-layout.component.scss'],
})
export class UserLayoutComponent {
  authService = inject(AuthService);
  private authPromptService = inject(AuthPromptService);
  private layoutService = inject(LayoutService);
  private router = inject(Router);

  /** The user's own manual collapse/expand choice via the toggle button. */
  private manualSidebarCollapsed = signal(false);
  /** Effective collapsed state — also true while a page (e.g. a filter drawer) needs the extra width. */
  sidebarCollapsed = computed(() => this.manualSidebarCollapsed() || this.layoutService.forceSidebarCollapsed());
  mobileSidebarOpen = signal(false);
  userDropdownOpen  = signal(false);
  isMobile          = signal(false);
  pageTitle         = signal('nav.dashboard');

  // `label`/`sectionLabel` hold catalog keys; the template translates them at
  // render so they react to the language toggle.
  // 'nav.dashboard' deliberately removed from the primary nav — the
  // homepage (see pages/home) is now the primary landing surface post-login;
  // /user/dashboard route/component still works for direct URL access, see
  // ROUTE_TITLES below (kept intact so its page title still resolves). A
  // 'nav.home' entry replaces it instead, so users navigating within
  // /user/** (this layout) still have a way back to /home — /home itself
  // isn't wrapped by this layout (it has its own header), so this link is
  // the only sidebar route to it.
  //
  // The Account entry swaps Profile → Sign In for a guest (this layout is
  // now also used to wrap the guest home view — see home.component.html),
  // since /user/profile is a guarded route a guest can't reach anyway.
  navItems = computed<NavItem[]>(() => [
    { label: 'nav.home',      icon: 'bi-house-door',     route: '/home',           sectionLabel: 'nav.section.main'    },
    { label: 'nav.community', icon: 'bi-people',         route: '/user/community', sectionLabel: 'nav.section.explore' },
    { label: 'nav.business',  icon: 'bi-shop',           route: '/user/business'                                       },
    { label: 'nav.jobs',      icon: 'bi-briefcase',      route: '/user/jobs'                                           },
    { label: 'nav.events',    icon: 'bi-calendar-event', route: '/user/events'                                         },
    this.authService.isAuthenticated()
      ? { label: 'nav.profile', icon: 'bi-person-circle',      route: '/user/profile', sectionLabel: 'nav.section.account' }
      : { label: 'nav.signIn', icon: 'bi-box-arrow-in-right', route: '/auth/login',  sectionLabel: 'nav.section.account' },
  ]);

  constructor() {
    this.checkScreenSize();
    this.updatePageTitle(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.updatePageTitle(e.urlAfterRedirects));
  }

  private updatePageTitle(url: string): void {
    const segments = url.split('/').filter((s) => s && !/^\d+$/.test(s));
    const segment = segments[segments.length - 1] ?? '';
    if (segment === 'home' && !this.authService.isAuthenticated()) {
      this.pageTitle.set('nav.guestPortal');
      return;
    }
    this.pageTitle.set(ROUTE_TITLES[segment] ?? 'nav.dashboard');
  }

  @HostListener('window:resize')
  onResize(): void { this.checkScreenSize(); }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-dropdown-wrapper')) {
      this.userDropdownOpen.set(false);
    }
  }

  private checkScreenSize(): void {
    const mobile = window.innerWidth < 992;
    this.isMobile.set(mobile);
    if (mobile) {
      this.manualSidebarCollapsed.set(false);
      this.mobileSidebarOpen.set(false);
    }
  }

  toggleSidebar(): void {
    if (this.isMobile()) {
      this.mobileSidebarOpen.update((v) => !v);
    } else {
      this.manualSidebarCollapsed.update((v) => !v);
    }
  }

  closeMobileSidebar(): void { this.mobileSidebarOpen.set(false); }
  toggleUserDropdown(): void { this.userDropdownOpen.update((v) => !v); }

  getUserInitials(): string {
    const user = this.authService.currentUser();
    if (!user) return 'U';
    return (user.displayName?.charAt(0) || user.userName?.charAt(0) || 'U').toUpperCase();
  }

  getUserFullName(): string {
    const user = this.authService.currentUser();
    if (!user) return 'User';
    return user.displayName || user.userName || 'User';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  onNavClick(): void {
    if (this.isMobile()) this.closeMobileSidebar();
  }

  /** A guest clicking a guarded /user/** nav item (Community/Business/Jobs/
   * Events) gets the "join to continue" gate instead of silently bouncing
   * off userGuard straight to the login page. */
  onNavItemClick(item: NavItem, event: MouseEvent): void {
    this.onNavClick();
    if (!this.authService.isAuthenticated() && item.route.startsWith('/user/')) {
      event.preventDefault();
      this.authPromptService.prompt();
    }
  }

  get sidebarLeft(): string {
    return (!this.isMobile() && this.sidebarCollapsed()) ? '70px' : '260px';
  }
}
