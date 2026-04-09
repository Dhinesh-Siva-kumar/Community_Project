import { Component, inject, signal, HostListener } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [NgClass, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
})
export class AdminLayoutComponent {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);
  mobileSidebarOpen = signal(false);
  userDropdownOpen = signal(false);
  isMobile = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'bi-grid', route: '/admin/dashboard' },
    { label: 'Community', icon: 'bi-people', route: '/admin/community' },
    { label: 'Post Approval', icon: 'bi-check-circle', route: '/admin/post-approval' },
    { label: 'User Management', icon: 'bi-person-gear', route: '/admin/user-management' },
    { label: 'Business', icon: 'bi-shop', route: '/admin/business' },
    { label: 'Events', icon: 'bi-calendar-event', route: '/admin/events' },
    { label: 'Jobs', icon: 'bi-briefcase', route: '/admin/jobs' },
    { label: 'Profile', icon: 'bi-person', route: '/admin/profile' },
  ];

  constructor() {
    this.checkScreenSize();
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

  onNavClick(): void {
    if (this.isMobile()) {
      this.closeMobileSidebar();
    }
  }
}
