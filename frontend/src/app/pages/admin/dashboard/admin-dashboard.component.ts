import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
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
export class AdminDashboardComponent implements OnInit {
  private userService = inject(UserService);

  loading = signal(true);
  stats = signal<DashboardStats | null>(null);
  statCards = signal<StatCard[]>([]);

  quickActions = signal<QuickAction[]>([
    {
      title: 'Create Community',
      description: 'Set up a new community for users to join',
      icon: 'bi-plus-circle-fill',
      color: '#4f46e5',
      route: '/admin/community',
    },
    {
      title: 'View Pending Posts',
      description: 'Review and approve pending community posts',
      icon: 'bi-clock-history',
      color: '#d97706',
      route: '/admin/post-approval',
    },
    {
      title: 'Manage Users',
      description: 'View, block, or trust user accounts',
      icon: 'bi-people-fill',
      color: '#059669',
      route: '/admin/user-management',
    },
    {
      title: 'Manage Businesses',
      description: 'Review and manage listed businesses',
      icon: 'bi-shop',
      color: '#dc2626',
      route: '/admin/business',
    },
  ]);

  ngOnInit(): void {
    this.loadDashboardStats();
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
            color: '#4f46e5',
            bgColor: '#eef2ff',
            route: '/admin/user-management',
          },
          {
            label: 'Total Communities',
            value: data.totalCommunities ?? 0,
            icon: 'bi-globe2',
            color: '#059669',
            bgColor: '#ecfdf5',
            route: '/admin/community',
          },
          {
            label: 'Pending Approvals',
            value: data.pendingPosts ?? 0,
            icon: 'bi-clock-history',
            color: '#d97706',
            bgColor: '#fffbeb',
            route: '/admin/post-approval',
          },
          {
            label: 'Total Posts',
            value: data.totalPosts ?? 0,
            icon: 'bi-file-earmark-text-fill',
            color: '#dc2626',
            bgColor: '#fef2f2',
            route: '/admin/post-approval',
          },
          {
            label: 'Total Businesses',
            value: data.totalBusinesses ?? 0,
            icon: 'bi-shop',
            color: '#7c3aed',
            bgColor: '#f5f3ff',
            route: '/admin/business',
          },
          {
            label: 'Total Events',
            value: data.totalEvents ?? 0,
            icon: 'bi-calendar-event-fill',
            color: '#0891b2',
            bgColor: '#ecfeff',
            route: '/admin/events',
          },
          {
            label: 'Total Jobs',
            value: data.totalJobs ?? 0,
            icon: 'bi-briefcase-fill',
            color: '#be185d',
            bgColor: '#fdf2f8',
            route: '/admin/jobs',
          },
        ]);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.statCards.set([
          { label: 'Total Users', value: 0, icon: 'bi-people-fill', color: '#4f46e5', bgColor: '#eef2ff', route: '/admin/user-management' },
          { label: 'Total Communities', value: 0, icon: 'bi-globe2', color: '#059669', bgColor: '#ecfdf5', route: '/admin/community' },
          { label: 'Pending Approvals', value: 0, icon: 'bi-clock-history', color: '#d97706', bgColor: '#fffbeb', route: '/admin/post-approval' },
          { label: 'Total Posts', value: 0, icon: 'bi-file-earmark-text-fill', color: '#dc2626', bgColor: '#fef2f2', route: '/admin/post-approval' },
          { label: 'Total Businesses', value: 0, icon: 'bi-shop', color: '#7c3aed', bgColor: '#f5f3ff', route: '/admin/business' },
          { label: 'Total Events', value: 0, icon: 'bi-calendar-event-fill', color: '#0891b2', bgColor: '#ecfeff', route: '/admin/events' },
          { label: 'Total Jobs', value: 0, icon: 'bi-briefcase-fill', color: '#be185d', bgColor: '#fdf2f8', route: '/admin/jobs' },
        ]);
      },
    });
  }

  getActivityIcon(type: string): string {
    switch (type) {
      case 'user': return 'bi-person-plus-fill';
      case 'pending_post': return 'bi-clock-history';
      case 'emergency_post': return 'bi-exclamation-triangle-fill';
      case 'post': return 'bi-file-earmark-text-fill';
      case 'business': return 'bi-shop';
      case 'event': return 'bi-calendar-event-fill';
      case 'job': return 'bi-briefcase-fill';
      default: return 'bi-activity';
    }
  }

  getActivityColor(type: string): string {
    switch (type) {
      case 'user': return '#4f46e5';
      case 'pending_post': return '#d97706';
      case 'emergency_post': return '#dc2626';
      case 'post': return '#059669';
      case 'business': return '#7c3aed';
      case 'event': return '#0891b2';
      case 'job': return '#be185d';
      default: return '#6b7280';
    }
  }
}
