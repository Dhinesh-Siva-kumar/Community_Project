import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { Observable, tap, map } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { Notification, NotificationPreferences, PaginatedResponse } from '../models';
import { environment } from '../../../environments/environment';

function normalize(n: any): Notification {
  return { ...n, isRead: n.isRead ?? n.is_read ?? false };
}

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  private socket: Socket | null = null;

  /** Latest page of notifications — enough to back the bell dropdown panel. */
  notifications = signal<Notification[]>([]);
  /** Authoritative unread count — sourced from GET /notifications/unread-count, not derived from `notifications` (which is only ever one page). */
  unreadCount = signal<number>(0);

  constructor() {
    this.authService.authStateChanges$.subscribe((user) => {
      if (user) {
        this.connect();
        this.getNotifications().subscribe({ error: () => {} });
        this.refreshUnreadCount().subscribe({ error: () => {} });
      } else {
        this.disconnect();
        this.notifications.set([]);
        this.unreadCount.set(0);
      }
    });
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(environment.wsUrl, {
      // A function (not a plain object) so every reconnect attempt re-reads
      // the current token from storage instead of replaying a possibly
      // rotated/expired one captured at the first connect.
      auth: (cb) => cb({ token: this.authService.getAccessToken() }),
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Notification socket connected');
    });

    this.socket.on('notification', (notification: any) => {
      const n = normalize(notification);
      this.notifications.update((current) => {
        // Aggregated updates (likes/comments) arrive with the same id as an
        // existing row — replace it in place instead of duplicating.
        const idx = current.findIndex((c) => c.id === n.id);
        if (idx !== -1) {
          const next = [...current];
          next[idx] = n;
          return next;
        }
        return [n, ...current];
      });
      this.refreshUnreadCount().subscribe({ error: () => {} });
      this.toastService.info(n.message);
    });

    this.socket.on('connect_error', (err: Error) => {
      console.warn('Notification socket connect error:', err.message);
    });

    this.socket.on('disconnect', () => {
      console.log('Notification socket disconnected');
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /** Populates the shared `notifications` signal (bell panel content) — first page only. */
  getNotifications(): Observable<Notification[]> {
    return this.api.get<{ data: any[] }>('/notifications').pipe(
      map((res) => (res.data ?? []).map(normalize)),
      tap((list) => this.notifications.set(list)),
    );
  }

  /** Full paginated fetch for the dedicated notifications page — does not touch the shared signals. */
  getNotificationsPage(page: number, limit: number): Observable<PaginatedResponse<Notification>> {
    return this.api.get<PaginatedResponse<any>>('/notifications', { page, limit }).pipe(
      map((res) => ({ ...res, data: (res.data ?? []).map(normalize) })),
    );
  }

  refreshUnreadCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>('/notifications/unread-count').pipe(
      tap((res) => this.unreadCount.set(res.count)),
    );
  }

  markAsRead(id: string): Observable<Notification> {
    return this.api.put<Notification>(`/notifications/${id}/read`).pipe(
      tap(() => {
        this.notifications.update((current) =>
          current.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        this.unreadCount.update((count) => Math.max(0, count - 1));
      })
    );
  }

  markAllAsRead(): Observable<void> {
    return this.api.put<void>('/notifications/read-all').pipe(
      tap(() => {
        this.notifications.update((current) =>
          current.map((n) => ({ ...n, isRead: true }))
        );
        this.unreadCount.set(0);
      })
    );
  }

  getPreferences(): Observable<NotificationPreferences> {
    return this.api.get<NotificationPreferences>('/notifications/preferences');
  }

  updatePreferences(data: Partial<NotificationPreferences>): Observable<NotificationPreferences> {
    return this.api.put<NotificationPreferences>('/notifications/preferences', data);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
