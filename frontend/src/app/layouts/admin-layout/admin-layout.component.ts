import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PostService } from '../../core/services/post.service';
import { CommunityService } from '../../core/services/community.service';
import { BusinessService } from '../../core/services/business.service';
import { JobService } from '../../core/services/job.service';
import { EventService } from '../../core/services/event.service';
import { ImageUrlPipe } from '../../shared/pipes/image-url.pipe';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  sectionLabel?: string;
}

const ROUTE_TITLES: Record<string, string> = {
  dashboard:         'Dashboard',
  community:         'Community',
  business:          'Business',
  jobs:              'Jobs',
  events:            'Events',
  'user-management': 'User Management',
  approval:          'Approval',
  analytics:         'Analytics',
  'audit-log':       'Audit Log',
  profile:           'Profile',
};

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [NgClass, RouterOutlet, RouterLink, RouterLinkActive, ImageUrlPipe],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
})
export class AdminLayoutComponent {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  private postService      = inject(PostService);
  private communityService = inject(CommunityService);
  private businessService  = inject(BusinessService);
  private jobService        = inject(JobService);
  private eventService      = inject(EventService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);
  mobileSidebarOpen = signal(false);
  userDropdownOpen = signal(false);
  isMobile = signal(false);
  pageTitle = signal('Dashboard');

  // Post Approval no longer has its own nav entry/page — it's a tab on the
  // unified Approval page now, so its pending count folds into this single
  // badge alongside Community/Business/Jobs/Events.
  pendingApprovalsCount = signal(0);
  hasPendingApprovals = computed(() => this.pendingApprovalsCount() > 0);

  navItems: NavItem[] = [
    { label: 'Dashboard',       icon: 'bi-grid',              route: '/admin/dashboard'                                     },
    { label: 'Community',       icon: 'bi-people',            route: '/admin/community',     sectionLabel: 'MANAGE'        },
    { label: 'Business',        icon: 'bi-shop',              route: '/admin/business'                                      },
    { label: 'Jobs',            icon: 'bi-briefcase',         route: '/admin/jobs'                                          },
    { label: 'Events',          icon: 'bi-calendar-event',    route: '/admin/events'                                        },
    { label: 'User Management', icon: 'bi-person-gear',       route: '/admin/user-management', sectionLabel: 'ADMIN'       },
    { label: 'Approval',        icon: 'bi-patch-check',       route: '/admin/approval'                                      },
    { label: 'Analytics',       icon: 'bi-graph-up',          route: '/admin/analytics'                                     },
    { label: 'Audit Log',       icon: 'bi-clock-history',     route: '/admin/audit-log'                                     },
    { label: 'Profile',         icon: 'bi-person-circle',     route: '/admin/profile',         sectionLabel: 'ACCOUNT'    },
  ];

  constructor() {
    this.checkScreenSize();
    this.updatePageTitle(this.router.url);
    this.loadPendingApprovalsCount();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
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
    this.pageTitle.set(ROUTE_TITLES[segment] ?? 'Dashboard');
  }

  onNavClick(): void {
    if (this.isMobile()) this.closeMobileSidebar();
  }

  get sidebarLeft(): string {
    return (!this.isMobile() && this.sidebarCollapsed()) ? '70px' : '260px';
  }
}
