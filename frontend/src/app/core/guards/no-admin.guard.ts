import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guards the /user subtree's browse pages (jobs, events, business,
 * community). Unlike userGuard, a guest is allowed to navigate here — the
 * page itself renders a "you're not registered/logged in" gate instead of
 * its real content for a guest (see GuestGateComponent). The only thing
 * this still blocks is an ADMIN account wandering into the user-facing area.
 */
export const noAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && authService.currentUser()?.role === 'ADMIN') {
    router.navigate(['/admin/dashboard']);
    return false;
  }

  return true;
};
