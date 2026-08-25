import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToggleComponent } from '../../../shared/components/toggle/toggle.component';
import { NotificationService } from '../../../core/services/notification.service';
import { ALL_NOTIFICATION_TYPES, Notification, NotificationType } from '../../../core/models';
import { notificationIcon, notificationColor, notificationBgColor, notificationRoute, notificationTypeLabel } from '../../../shared/utils/notification-display';
import { timeAgo } from '../../../shared/utils/time-ago';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationTextPipe } from '../../../shared/pipes/notification-text.pipe';

type ReadFilter = 'all' | 'unread';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [FormsModule, ToggleComponent, TranslatePipe, NotificationTextPipe],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss'],
})
export class NotificationsComponent implements OnInit {
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // Mounted at both /admin/notifications and /user/notifications — same
  // role-detection convention as pages/shared/community-detail.
  isAdmin = computed(() => this.router.url.startsWith('/admin'));

  items = signal<Notification[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  filter = signal<ReadFilter>('all');
  page = signal(1);
  readonly pageSize = 20;
  hasMore = signal(false);

  filteredItems = computed(() =>
    this.filter() === 'unread' ? this.items().filter((n) => !n.isRead) : this.items()
  );

  // ── Preferences ──────────────────────────────────────────
  showPreferences = signal(false);
  preferencesLoading = signal(true);
  mutedTypes = signal<Set<NotificationType>>(new Set());
  emailDigestEnabled = signal(false);
  readonly allTypes = ALL_NOTIFICATION_TYPES;

  ngOnInit(): void {
    this.load();
    this.loadPreferences();
  }

  setFilter(filter: ReadFilter): void {
    if (this.filter() === filter) return;
    this.filter.set(filter);
  }

  private load(): void {
    this.loading.set(true);
    this.page.set(1);
    this.notificationService.getNotificationsPage(1, this.pageSize).subscribe({
      next: (res) => {
        this.items.set(res.data);
        this.hasMore.set(res.page < res.totalPages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMore(): void {
    if (!this.hasMore() || this.loadingMore()) return;
    const nextPage = this.page() + 1;
    this.loadingMore.set(true);
    this.notificationService.getNotificationsPage(nextPage, this.pageSize).subscribe({
      next: (res) => {
        this.items.update((list) => [...list, ...res.data]);
        this.page.set(nextPage);
        this.hasMore.set(res.page < res.totalPages);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  markAllRead(): void {
    this.notificationService.markAllAsRead().subscribe({
      next: () => this.items.update((list) => list.map((n) => ({ ...n, isRead: true }))),
      error: () => {},
    });
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
    return timeAgo(n.createdAt);
  }

  open(n: Notification): void {
    if (!n.isRead) {
      this.notificationService.markAsRead(n.id).subscribe({
        next: () => this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))),
        error: () => {},
      });
    }

    const route = notificationRoute(n.type, n.relatedEntityId, this.isAdmin());
    if (route) {
      this.router.navigate(route.path, route.queryParams ? { queryParams: route.queryParams } : {});
    }
  }

  // ── Preferences ──────────────────────────────────────────
  togglePreferencesPanel(): void {
    this.showPreferences.update((v) => !v);
  }

  private loadPreferences(): void {
    this.preferencesLoading.set(true);
    this.notificationService.getPreferences().subscribe({
      next: (prefs) => {
        this.mutedTypes.set(new Set(prefs.mutedTypes));
        this.emailDigestEnabled.set(prefs.emailDigestEnabled);
        this.preferencesLoading.set(false);
      },
      error: () => this.preferencesLoading.set(false),
    });
  }

  typeLabel(type: NotificationType): string {
    return notificationTypeLabel(type);
  }

  isTypeEnabled(type: NotificationType): boolean {
    return !this.mutedTypes().has(type);
  }

  toggleType(type: NotificationType): void {
    const next = new Set(this.mutedTypes());
    if (next.has(type)) next.delete(type);
    else next.add(type);
    this.mutedTypes.set(next);

    this.notificationService.updatePreferences({ mutedTypes: Array.from(next) }).subscribe({ error: () => {} });
  }

  toggleEmailDigest(): void {
    const next = !this.emailDigestEnabled();
    this.emailDigestEnabled.set(next);
    this.notificationService.updatePreferences({ emailDigestEnabled: next }).subscribe({ error: () => {} });
  }
}
