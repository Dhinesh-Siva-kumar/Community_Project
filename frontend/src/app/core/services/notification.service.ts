import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Notification } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private api = inject(ApiService);
  private authService = inject(AuthService);

  private socket: Socket | null = null;

  notifications = signal<Notification[]>([]);
  unreadCount = signal<number>(0);

  constructor() {
    this.authService.authStateChanges$.subscribe((user) => {
      if (user) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.authService.getAccessToken();
    if (!token) {
      return;
    }

    this.socket = io(environment.wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('notification', (notification: Notification) => {
      this.notifications.update((current) => [notification, ...current]);
      this.unreadCount.update((count) => count + 1);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getNotifications(): Observable<Notification[]> {
    return this.api.get<Notification[]>('/notifications').pipe(
      tap((notifications) => {
        this.notifications.set(notifications);
        this.unreadCount.set(notifications.filter((n) => !n.isRead).length);
      })
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

  ngOnDestroy(): void {
    this.disconnect();
  }
}
