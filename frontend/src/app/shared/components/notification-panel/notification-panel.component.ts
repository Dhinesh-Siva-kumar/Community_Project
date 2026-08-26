import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { Notification } from '../../../core/models';
import { notificationIcon, notificationColor, notificationBgColor, notificationRoute } from '../../utils/notification-display';
import { timeAgo } from '../../utils/time-ago';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationTextPipe } from '../../../shared/pipes/notification-text.pipe';
import { RelativeTimeService } from '../../../core/services/relative-time.service';

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [TranslatePipe, NotificationTextPipe],
  templateUrl: './notification-panel.component.html',
  styleUrls: ['./notification-panel.component.scss'],
})
export class NotificationPanelComponent {
  private relativeTimeService = inject(RelativeTimeService);
  /** Which layout this panel lives in — governs where notification clicks navigate (admin vs user routes). */
  readonly isAdmin = input(false);

  notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private hostEl = inject(ElementRef<HTMLElement>);

  isOpen = signal(false);

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (this.isOpen() && !this.hostEl.nativeElement.contains(e.target as Node)) {
      this.isOpen.set(false);
    }
  }

  icon(n: Notification): string {
    return notificationIcon(n.type);
  }

  color(n: Notification): string {
    return notificationColor(n.type);
  }

  bgColor(n: Notification): string {
    return notificationBgColor(n.type);
  }

  relativeTime(n: Notification): string {
    return this.relativeTimeService.short(n.createdAt);
  }

  markAllRead(event: Event): void {
    event.stopPropagation();
    this.notificationService.markAllAsRead().subscribe({ error: () => {} });
  }

  open(n: Notification): void {
    if (!n.isRead) {
      this.notificationService.markAsRead(n.id).subscribe({ error: () => {} });
    }
    this.isOpen.set(false);

    const route = notificationRoute(n.type, n.relatedEntityId, this.isAdmin());
    if (route) {
      this.router.navigate(route.path, route.queryParams ? { queryParams: route.queryParams } : {});
    }
  }

  viewAll(): void {
    this.isOpen.set(false);
    this.router.navigate([this.isAdmin() ? '/admin/notifications' : '/user/notifications']);
  }
}
