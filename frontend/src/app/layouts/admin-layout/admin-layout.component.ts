import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { LayoutService } from '../../core/services/layout.service';
import { PostService } from '../../core/services/post.service';
import { CommunityService } from '../../core/services/community.service';
import { BusinessService } from '../../core/services/business.service';
import { JobService } from '../../core/services/job.service';
import { EventService } from '../../core/services/event.service';
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
  dashboard:         'nav.dashboard',
  community:         'nav.community',
  business:          'nav.business',
  jobs:              'nav.jobs',
  events:            'nav.events',
  'user-management': 'nav.userManagement',
  approval:          'nav.approval',
  analytics:         'nav.analytics',
  'audit-log':       'nav.auditLog',
  profile:           'nav.profile',
};

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [NgClass, RouterOutlet, RouterLink, RouterLinkActive, ImageUrlPipe, NotificationPanelComponent, ThemeToggleComponent, LanguageToggleComponent, ScrollLockDirective, TranslatePipe],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
})
export class AdminLayoutComponent {
  authService = inject(AuthService);
  private layoutService     = inject(LayoutService);
  private postService      = inject(PostService);
  private communityService = inject(CommunityService);
  private businessService  = inject(BusinessService);
  private jobService        = inject(JobService);
  private eventService      = inject(EventService);
  private router = inject(Router);

  /** The admin's own manual collapse/expand choice via the toggle button. */
  private manualSidebarCollapsed = signal(false);
  /** Effective collapsed state — also true while a page (e.g. a filter drawer) needs the extra width. */
  sidebarCollapsed = computed(() => this.manualSidebarCollapsed() || this.layoutService.forceSidebarCollapsed());
  mobileSidebarOpen = signal(false);
  userDropdownOpen = signal(false);
  isMobile = signal(false);
  pageTitle = signal('nav.dashboard');

  // Post Approval no longer has its own nav entry/page — it's a tab on the
  // unified Approval page now, so its pending count folds into this single
  // badge alongside Community/Business/Jobs/Events.
  pendingApprovalsCount = signal(0);
  hasPendingApprovals = computed(() => this.pendingApprovalsCount() > 0);

  // `label`/`sectionLabel` hold catalog keys; the template translates them at
  // render so they react to the language toggle.
  navItems: NavItem[] = [
    { label: 'nav.dashboard',      icon: 'bi-grid',           route: '/admin/dashboard'                                             },
    { label: 'nav.community',      icon: 'bi-people',         route: '/admin/community',       sectionLabel: 'nav.section.manage'   },
    { label: 'nav.business',       icon: 'bi-shop',           route: '/admin/business'                                              },
    { label: 'nav.jobs',           icon: 'bi-briefcase',      route: '/admin/jobs'                                                  },
    { label: 'nav.events',         icon: 'bi-calendar-event', route: '/admin/events'                                                },
    { label: 'nav.userManagement', icon: 'bi-person-gear',    route: '/admin/user-management', sectionLabel: 'nav.section.admin'    },
    { label: 'nav.approval',       icon: 'bi-patch-check',    route: '/admin/approval'                                              },
    { label: 'nav.analytics',      icon: 'bi-graph-up',       route: '/admin/analytics'                                             },
    { label: 'nav.auditLog',       icon: 'bi-clock-history',  route: '/admin/audit-log'                                             },
    { label: 'nav.profile',        icon: 'bi-person-circle',  route: '/admin/profile',         sectionLabel: 'nav.section.account'  },
  ];

  constructor() {
    this.checkScreenSize();
    this.updatePageTitle(this.router.url);
    this.loadPendingApprovalsCount();
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.updatePageTitle(e.urlAfterRedirects);
        this.loadPendingApprovalsCount();
      });
  }

  private loadPendingApprovalsCount(): void {
    forkJoin({
      posts:     this.postService.getPendingCount(),
      community: this.communityService.getPendingCommunitiesCount(),
      business:  this.businessService.getPendingBusinessesCount(),
      jobs:       this.jobService.getPendingJobsCount(),
      events:     this.eventService.getPendingEventsCount(),
    }).subscribe({
      next: (res) => this.pendingApprovalsCount.set(
        res.posts.count + res.community.count + res.business.count + res.jobs.count + res.events.count
      ),
      error: () => {},
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.checkScreenSize();
  }

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

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  toggleUserDropdown(): void {
    this.userDropdownOpen.update((v) => !v);
  }

  getUserInitials(): string {
    const user = this.authService.currentUser();
    if (!user) return 'A';
    return (user.displayName?.charAt(0) || user.userName?.charAt(0) || 'A').toUpperCase();
  }

  getUserFullName(): string {
    const user = this.authService.currentUser();
    if (!user) return 'Admin';
    return user.displayName || user.userName || 'Admin';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  private updatePageTitle(url: string): void {
    const segments = url.split('/').filter((s) => s && !/^\d+$/.test(s));
    const segment = segments[segments.length - 1] ?? '';
    this.pageTitle.set(ROUTE_TITLES[segment] ?? 'nav.dashboard');
  }

  onNavClick(): void {
    if (this.isMobile()) this.closeMobileSidebar();
  }

  get sidebarLeft(): string {
    return (!this.isMobile() && this.sidebarCollapsed()) ? '70px' : '260px';
  }
}
