import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { userGuard } from './core/guards/user.guard';
import { guestGuard } from './core/guards/guest.guard';
import { noAdminGuard } from './core/guards/no-admin.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full',
  },

  // Public routes
  {
    path: '',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout.component').then(
        (m) => m.PublicLayoutComponent
      ),
    children: [
      {
        path: 'landing',
        loadComponent: () =>
          import('./pages/landing/landing.component').then(
            (m) => m.LandingComponent
          ),
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./pages/home/home.component').then(
            (m) => m.HomeComponent
          ),
      },
      {
        path: 'auth/login',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./pages/auth/login/login.component').then(
            (m) => m.LoginComponent
          ),
      },
      {
        path: 'auth/register',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./pages/auth/register/register.component').then(
            (m) => m.RegisterComponent
          ),
      },
      {
        path: 'auth/admin-login',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./pages/auth/admin-login/admin-login.component').then(
            (m) => m.AdminLoginComponent
          ),
      },
      {
        path: 'auth/forgot-password',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./pages/auth/forgot-password/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent
          ),
      },
    ],
  },

  // Admin routes
  {
    path: 'admin',
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout.component').then(
        (m) => m.AdminLayoutComponent
      ),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/admin/dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent
          ),
      },
      {
        path: 'community',
        loadComponent: () =>
          import('./pages/admin/community/admin-community.component').then(
            (m) => m.AdminCommunityComponent
          ),
      },
      {
        path: 'community/:id',
        loadComponent: () =>
          import('./pages/admin/community/community-detail/community-detail.component').then(
            (m) => m.CommunityDetailComponent
          ),
      },
      {
        path: 'approval',
        loadComponent: () =>
          import('./pages/admin/approval/approval.component').then(
            (m) => m.ApprovalComponent
          ),
      },
      {
        path: 'user-management',
        loadComponent: () =>
          import('./pages/admin/user-management/user-management.component').then(
            (m) => m.UserManagementComponent
          ),
      },
      {
        path: 'business',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/admin/business/business.component').then(
            (m) => m.AdminBusinessComponent
          ),
      },
      {
        path: 'events',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/admin/events/events.component').then(
            (m) => m.AdminEventsComponent
          ),
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./pages/admin/events/event-detail/event-detail.component').then(
            (m) => m.EventDetailComponent
          ),
      },
      {
        path: 'jobs',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/admin/jobs/jobs.component').then(
            (m) => m.AdminJobsComponent
          ),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./pages/admin/analytics/analytics.component').then(
            (m) => m.AdminAnalyticsComponent
          ),
      },
      {
        path: 'audit-log',
        loadComponent: () =>
          import('./pages/admin/audit-log/audit-log.component').then(
            (m) => m.AuditLogComponent
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/admin/profile/profile.component').then(
            (m) => m.AdminProfileComponent
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./pages/shared/notifications/notifications.component').then(
            (m) => m.NotificationsComponent
          ),
      },
    ],
  },

  // User routes
  //
  // No userGuard at this level: jobs/events/business/community pages stay
  // reachable for a guest — they just render a "please register or log in"
  // gate instead of any real content (see GuestGateComponent). Only profile
  // and notifications — inherently account-bound — keep userGuard below.
  {
    path: 'user',
    loadComponent: () =>
      import('./layouts/user-layout/user-layout.component').then(
        (m) => m.UserLayoutComponent
      ),
    canActivate: [noAdminGuard],
    children: [
      {
        path: '',
        redirectTo: '/home',
        pathMatch: 'full',
      },
      // The dashboard page's content (stats, post feed, jobs/communities/
      // business widgets) is now embedded directly inside HomeComponent's
      // registered-user view (see pages/home/home.component.html) — nothing
      // is exclusive to this URL anymore, so it just forwards there.
      {
        path: 'dashboard',
        redirectTo: '/home',
        pathMatch: 'full',
      },
      {
        path: 'community',
        loadComponent: () =>
          import('./pages/user/community/user-community.component').then(
            (m) => m.UserCommunityComponent
          ),
      },
      {
        path: 'community/:id',
        loadComponent: () =>
          import('./pages/user/community/community-detail/community-detail.component').then(
            (m) => m.CommunityDetailComponent
          ),
      },
      {
        path: 'business',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/user/business/business.component').then(
            (m) => m.UserBusinessComponent
          ),
      },
      {
        path: 'events',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/user/events/events.component').then(
            (m) => m.UserEventsComponent
          ),
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./pages/user/events/event-detail/event-detail.component').then(
            (m) => m.EventDetailComponent
          ),
      },
      {
        path: 'jobs',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./pages/user/jobs/jobs.component').then(
            (m) => m.UserJobsComponent
          ),
      },
      {
        path: 'profile',
        canActivate: [userGuard],
        loadComponent: () =>
          import('./pages/user/profile/profile.component').then(
            (m) => m.UserProfileComponent
          ),
      },
      {
        path: 'notifications',
        canActivate: [userGuard],
        loadComponent: () =>
          import('./pages/shared/notifications/notifications.component').then(
            (m) => m.NotificationsComponent
          ),
      },
    ],
  },

  // Wildcard
  {
    path: '**',
    redirectTo: 'landing',
  },
];
