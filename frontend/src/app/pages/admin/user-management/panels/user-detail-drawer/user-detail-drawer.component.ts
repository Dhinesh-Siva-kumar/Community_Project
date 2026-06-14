import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../../../core/services/user.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { UserDetail, User } from '../../../../../core/models';
import { ImageUrlPipe } from '../../../../../shared/pipes/image-url.pipe';

type DrawerTab = 'overview' | 'activity' | 'actions';

@Component({
  selector: 'app-user-detail-drawer',
  standalone: true,
  imports: [CommonModule, DatePipe, SlicePipe, FormsModule, ImageUrlPipe],
  templateUrl: './user-detail-drawer.component.html',
  styleUrls: ['./user-detail-drawer.component.scss'],
})
export class UserDetailDrawerComponent implements OnInit {
  @Input({ required: true }) userId!: string;
  @Output() close       = new EventEmitter<void>();
  @Output() userUpdated = new EventEmitter<User>();
  @Output() userDeleted = new EventEmitter<void>();

  private userService = inject(UserService);
  private toast       = inject(ToastService);

  user      = signal<UserDetail | null>(null);
  loading   = signal(true);
  activeTab = signal<DrawerTab>('overview');
  working   = signal<string | null>(null);

  // Role change
  newRole   = signal<'ADMIN' | 'USER'>('USER');
  newPassword = signal('');
  showResetPw = signal(false);

  ngOnInit(): void { this.loadUser(); }

  loadUser(): void {
    this.loading.set(true);
    this.userService.getUserById(this.userId).subscribe({
      next: (u) => { this.user.set(u); this.newRole.set(u.role); this.loading.set(false); },
      error: () => { this.toast.error('Failed to load user'); this.loading.set(false); },
    });
  }

  toggleBlock(): void {
    const u = this.user();
    if (!u) return;
    this.working.set('block');
    const obs = u.isBlocked ? this.userService.unblockUser(u.id) : this.userService.blockUser(u.id);
    obs.subscribe({
      next: (res) => {
        const updated = { ...u, isBlocked: !u.isBlocked };
        this.user.set(updated as UserDetail);
        this.userUpdated.emit(updated as User);
        this.toast.success(u.isBlocked ? 'User unblocked' : 'User blocked');
        this.working.set(null);
      },
      error: () => { this.toast.error('Action failed'); this.working.set(null); },
    });
  }

  toggleTrust(): void {
    const u = this.user();
    if (!u) return;
    this.working.set('trust');
    const obs = u.isTrusted ? this.userService.untrustUser(u.id) : this.userService.trustUser(u.id);
    obs.subscribe({
      next: () => {
        const updated = { ...u, isTrusted: !u.isTrusted };
        this.user.set(updated as UserDetail);
        this.userUpdated.emit(updated as User);
        this.toast.success(u.isTrusted ? 'Trust removed' : 'User trusted');
        this.working.set(null);
      },
      error: () => { this.toast.error('Action failed'); this.working.set(null); },
    });
  }

  saveRole(): void {
    const u = this.user();
    if (!u || this.newRole() === u.role) return;
    this.working.set('role');
    this.userService.changeUserRole(u.id, this.newRole()).subscribe({
      next: (updated) => {
        this.user.set({ ...u, role: updated.role, roleLevel: updated.roleLevel });
        this.userUpdated.emit(updated);
        this.toast.success('Role updated');
        this.working.set(null);
      },
      error: (err) => { this.toast.error(err?.error?.message || 'Failed to update role'); this.working.set(null); },
    });
  }

  resetPassword(): void {
    const pw = this.newPassword().trim();
    if (!pw || pw.length < 8) { this.toast.error('Password must be at least 8 characters'); return; }
    const u = this.user();
    if (!u) return;
    this.working.set('reset');
    this.userService.adminResetPassword(u.id, pw).subscribe({
      next: () => { this.toast.success('Password reset successfully'); this.newPassword.set(''); this.showResetPw.set(false); this.working.set(null); },
      error: () => { this.toast.error('Failed to reset password'); this.working.set(null); },
    });
  }

  deleteUser(): void {
    const u = this.user();
    if (!u) return;
    if (!confirm(`Delete "${u.displayName}"? This will deactivate their account.`)) return;
    this.working.set('delete');
    this.userService.softDeleteUser(u.id).subscribe({
      next: () => { this.toast.success('User deactivated'); this.userDeleted.emit(); this.close.emit(); },
      error: () => { this.toast.error('Failed to delete user'); this.working.set(null); },
    });
  }

  getInitials(u: UserDetail): string {
    return (u.displayName ?? u.userName ?? '?').charAt(0).toUpperCase();
  }

  getStatusLabel(u: UserDetail): string {
    if (u.isBlocked) return 'Blocked';
    if (!u.isActive) return 'Inactive';
    return 'Active';
  }
}
