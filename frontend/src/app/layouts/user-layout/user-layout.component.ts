import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  sectionLabel?: string;
}

const ROUTE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  community: 'Community',
  business:  'Business',
  events:    'Events',
  jobs:      'Jobs',
  profile:   'Profile',
};

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [NgClass, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './user-layout.component.html',
  styleUrls: ['./user-layout.component.scss'],
})
export class UserLayoutComponent {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);
  mobileSidebarOpen = signal(false);
  userDropdownOpen  = signal(false);
  isMobile          = signal(false);
  pageTitle         = signal('Dashboard');

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'bi-grid',           route: '/user/dashboard',  sectionLabel: 'MAIN'    },
    { label: 'Community', icon: 'bi-people',         route: '/user/community',  sectionLabel: 'EXPLORE' },
    { label: 'Business',  icon: 'bi-shop',           route: '/user/business'                            },
    { label: 'Events',    icon: 'bi-calendar-event', route: '/user/events'                              },
    { label: 'Jobs',      icon: 'bi-briefcase',      route: '/user/jobs'                                },
    { label: 'Profile',   icon: 'bi-person-circle',  route: '/user/profile',    sectionLabel: 'ACCOUNT' },
  ];

  constructor() {
    this.checkScreenSize();
    this.updatePageTitle(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.updatePageTitle(e.urlAfterRedirects));
  }

  private updatePageTitle(url: string): void {
    const segments = url.split('/').filter((s) => s && !/^\d+$/.test(s));
    const segment = segments[segments.length - 1] ?? '';
    this.pageTitle.set(ROUTE_TITLES[segment] ?? 'Dashboard');
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
      this.sidebarCollapsed.set(false);
      this.mobileSidebarOpen.set(false);
    }
  }

  toggleSidebar(): void {
    if (this.isMobile()) {
      this.mobileSidebarOpen.update((v) => !v);
    } else {
      this.sidebarCollapsed.update((v) => !v);
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

  get sidebarLeft(): string {
    return (!this.isMobile() && this.sidebarCollapsed()) ? '70px' : '260px';
  }
}
