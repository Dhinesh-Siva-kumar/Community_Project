import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardStats } from '../../../core/models';

interface StatCard {
  label: string;
  value: number;
  icon: string;
  color: string;
  bgColor: string;
  route: string;
}

interface QuickAction {
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private clockTimer?: number;

  loading = signal(true);
  stats = signal<DashboardStats | null>(null);
  statCards = signal<StatCard[]>([]);
  today = signal(new Date());

  pendingCount = computed(() => this.stats()?.pendingPosts ?? 0);

  quickActions = signal<QuickAction[]>([
    {
      title: 'Create Community',
      description: 'Set up a new community for users to join',
      icon: 'bi-plus-circle-fill',
      color: '#F59E0B',
      route: '/admin/community',
    },
    {
      title: 'Review Pending Posts',
      description: 'Review and approve pending community posts',
      icon: 'bi-clock-history',
      color: '#B45309',
      route: '/admin/post-approval',
    },
    {
      title: 'Manage Users',
      description: 'View, block, or trust user accounts',
      icon: 'bi-people-fill',
      color: '#16A34A',
      route: '/admin/user-management',
    },
    {
      title: 'Manage Businesses',
      description: 'Review and manage listed businesses',
      icon: 'bi-shop',
      color: '#7C3AED',
      route: '/admin/business',
    },
  ]);

  ngOnInit(): void {
    this.loadDashboardStats();
    this.clockTimer = window.setInterval(() => this.today.set(new Date()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  loadDashboardStats(): void {
    this.loading.set(true);
    this.userService.getDashboardStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.statCards.set([
          {
            label: 'Total Users',
            value: data.totalUsers ?? 0,
            icon: 'bi-people-fill',
            color: '#F59E0B',
            bgColor: '#FFFBEB',
            route: '/admin/user-management',
          },
          {
            label: 'Communities',
            value: data.totalCommunities ?? 0,
            icon: 'bi-globe2',
            color: '#16A34A',
            bgColor: '#DCFCE7',
            route: '/admin/community',
          },
          {
            label: 'Pending Review',
            value: data.pendingPosts ?? 0,
            icon: 'bi-hourglass-split',
            color: '#B45309',
            bgColor: '#FEF3C7',
            route: '/admin/post-approval',
          },
          {
            label: 'Total Posts',
            value: data.totalPosts ?? 0,
            icon: 'bi-file-earmark-text-fill',
            color: '#0EA5E9',
            bgColor: '#E0F2FE',
            route: '/admin/post-approval',
          },
          {
            label: 'Businesses',
            value: data.totalBusinesses ?? 0,
            icon: 'bi-shop',
            color: '#7C3AED',
            bgColor: '#EDE9FE',
            route: '/admin/business',
          },
          {
            label: 'Events',
            value: data.totalEvents ?? 0,
            icon: 'bi-calendar-event-fill',
            color: '#D97706',
            bgColor: '#FEF3C7',
            route: '/admin/events',
          },
          {
            label: 'Job Listings',
            value: data.totalJobs ?? 0,
            icon: 'bi-briefcase-fill',
            color: '#78716C',
            bgColor: '#F5F5F4',
            route: '/admin/jobs',
          },
        ]);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.statCards.set([
          { label: 'Total Users',    value: 0, icon: 'bi-people-fill',          color: '#F59E0B', bgColor: '#FFFBEB', route: '/admin/user-management' },
          { label: 'Communities',    value: 0, icon: 'bi-globe2',               color: '#16A34A', bgColor: '#DCFCE7', route: '/admin/community' },
          { label: 'Pending Review', value: 0, icon: 'bi-hourglass-split',      color: '#B45309', bgColor: '#FEF3C7', route: '/admin/post-approval' },
          { label: 'Total Posts',    value: 0, icon: 'bi-file-earmark-text-fill', color: '#0EA5E9', bgColor: '#E0F2FE', route: '/admin/post-approval' },
          { label: 'Businesses',     value: 0, icon: 'bi-shop',                 color: '#7C3AED', bgColor: '#EDE9FE', route: '/admin/business' },
          { label: 'Events',         value: 0, icon: 'bi-calendar-event-fill',  color: '#D97706', bgColor: '#FEF3C7', route: '/admin/events' },
          { label: 'Job Listings',   value: 0, icon: 'bi-briefcase-fill',       color: '#78716C', bgColor: '#F5F5F4', route: '/admin/jobs' },
        ]);
      },
    });
  }

  getActivityIcon(type: string): string {
    switch (type) {
      case 'user':           return 'bi-person-plus-fill';
      case 'pending_post':   return 'bi-hourglass-split';
      case 'emergency_post': return 'bi-exclamation-triangle-fill';
      case 'post':           return 'bi-file-earmark-text-fill';
      case 'business':       return 'bi-shop';
      case 'event':          return 'bi-calendar-event-fill';
      case 'job':            return 'bi-briefcase-fill';
      default:               return 'bi-activity';
    }
  }

  getActivityColor(type: string): string {
    switch (type) {
      case 'user':           return '#F59E0B';
      case 'pending_post':   return '#B45309';
      case 'emergency_post': return '#DC2626';
      case 'post':           return '#0EA5E9';
      case 'business':       return '#7C3AED';
      case 'event':          return '#D97706';
      case 'job':            return '#78716C';
      default:               return '#A8A29E';
    }
  }

  getActivityTypeLabel(type: string): string {
    const map: Record<string, string> = {
      user:           'Member',
      pending_post:   'Review',
      emergency_post: 'Alert',
      post:           'Post',
      business:       'Business',
      event:          'Event',
      job:            'Job',
    };
    return map[type] ?? type;
  }

  getTimeAgo(dateStr: string): string {
    const date   = new Date(dateStr);
    const now    = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);
    if (diffMins  <  1) return 'just now';
    if (diffMins  < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays  ===1) return 'yesterday';
    if (diffDays  <  7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  getAdminFirstName(): string {
    const user = this.authService.currentUser();
    if (!user) return 'Admin';
    const name = user.displayName || user.userName || 'Admin';
    return name.split(' ')[0];
  }
}
