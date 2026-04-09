import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { guestGuard } from './core/guards/guest.guard';

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
    // canActivate: [authGuard, adminGuard],
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
        path: 'post-approval',
        loadComponent: () =>
          import('./pages/admin/post-approval/post-approval.component').then(
            (m) => m.PostApprovalComponent
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
        loadComponent: () =>
          import('./pages/admin/business/business.component').then(
            (m) => m.AdminBusinessComponent
          ),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./pages/admin/events/events.component').then(
            (m) => m.AdminEventsComponent
          ),
      },
      {
        path: 'jobs',
        loadComponent: () =>
          import('./pages/admin/jobs/jobs.component').then(
            (m) => m.AdminJobsComponent
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/admin/profile/profile.component').then(
            (m) => m.AdminProfileComponent
          ),
      },
    ],
  },

  // User routes
  {
    path: 'user',
    loadComponent: () =>
      import('./layouts/user-layout/user-layout.component').then(
        (m) => m.UserLayoutComponent
      ),
    // canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/user/dashboard/user-dashboard.component').then(
            (m) => m.UserDashboardComponent
          ),
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
        loadComponent: () =>
          import('./pages/user/business/business.component').then(
            (m) => m.UserBusinessComponent
          ),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./pages/user/events/events.component').then(
            (m) => m.UserEventsComponent
          ),
      },
      {
        path: 'jobs',
        loadComponent: () =>
          import('./pages/user/jobs/jobs.component').then(
            (m) => m.UserJobsComponent
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/user/profile/profile.component').then(
            (m) => m.UserProfileComponent
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
