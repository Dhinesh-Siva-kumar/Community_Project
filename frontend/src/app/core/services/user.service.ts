import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  User, UserDetail, UserListResponse, AuditLog, AuditLogResponse,
  NotificationType, PaginatedResponse, DashboardStats, ChartData,
} from '../models';
import { FORM_DATA_FIELD_NAMES } from '../constants/upload.constants';

export interface AdminCreateUserPayload {
  userName:    string;
  displayName: string;
  email?:      string;
  phoneNo?:    string;
  password:    string;
  countryId?:  number;
}

export interface UserFilterParams {
  page?:    number;
  limit?:   number;
  search?:  string;
  role?:    'ADMIN' | 'USER' | '';
  status?:  'active' | 'blocked' | 'trusted' | '';
  joined?:  'today' | '7d' | '30d' | '90d' | '';
  country?: string;
  sortBy?:  'name' | 'email' | 'joined' | 'role';
  sortDir?: 'asc' | 'desc';
}

export interface BroadcastPayload {
  type:      NotificationType;
  message:   string;
  recipient: 'all' | 'role' | 'user';
  role?:     'ADMIN' | 'USER';
  userId?:   string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private api = inject(ApiService);

  // ── Self-service ──────────────────────────────────────────────────────────
  getProfile(): Observable<User> {
    return this.api.get<User>('/users/profile');
  }

   updateProfile(data: Record<string, any>, avatar?: File): Observable<User> {
     if (avatar) {
       return this.api.putWithFile<User>('/users/profile', data, [{ field: FORM_DATA_FIELD_NAMES.AVATAR, file: avatar }]);
     }
     return this.api.put<User>('/users/profile', data);
   }

  getDashboardStats(): Observable<DashboardStats> {
    return this.api.get<DashboardStats>('/users/dashboard');
  }

  getChartData(from?: string, to?: string): Observable<ChartData> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.api.get<ChartData>('/users/charts', params);
  }

  // ── Admin — list & detail ─────────────────────────────────────────────────
  getUsers(params?: UserFilterParams): Observable<UserListResponse> {
    const clean: Record<string, any> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      });
    }
    return this.api.get<UserListResponse>('/users', clean);
  }

  getUserById(id: string): Observable<UserDetail> {
    return this.api.get<UserDetail>(`/users/${id}`);
  }

  // ── Admin — create / modify ───────────────────────────────────────────────
  adminCreateUser(payload: AdminCreateUserPayload): Observable<User> {
    return this.api.post<User>('/users', payload);
  }

  softDeleteUser(id: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete<{ success: boolean; message: string }>(`/users/${id}`);
  }

  adminResetPassword(id: string, newPassword: string): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>(`/users/${id}/reset-password`, { newPassword });
  }

  // ── Admin — block / trust ─────────────────────────────────────────────────
  blockUser(id: string): Observable<Partial<User>> {
    return this.api.put<Partial<User>>(`/users/${id}/block`);
  }

  unblockUser(id: string): Observable<Partial<User>> {
    return this.api.put<Partial<User>>(`/users/${id}/unblock`);
  }

  trustUser(id: string): Observable<Partial<User>> {
    return this.api.put<Partial<User>>(`/users/${id}/trust`);
  }

  untrustUser(id: string): Observable<Partial<User>> {
    return this.api.put<Partial<User>>(`/users/${id}/untrust`);
  }

  // ── Admin — audit & notifications ────────────────────────────────────────
  getAuditLogs(params?: { page?: number; limit?: number; action?: string; userId?: string }): Observable<AuditLogResponse> {
    return this.api.get<AuditLogResponse>('/users/audit-logs', params ?? {});
  }

  broadcastNotification(payload: BroadcastPayload): Observable<{ success: boolean; sent: number }> {
    return this.api.post<{ success: boolean; sent: number }>('/users/broadcast', payload);
  }

  // ── Admin — export ────────────────────────────────────────────────────────
  // Overall export: every user in the system, ignoring any active list
  // filters. The listing endpoint caps `limit` at 100 per request, so this
  // pages through everything and stitches the results back together.
  private static readonly EXPORT_PAGE_SIZE = 100;

  exportAllUsers(): Observable<User[]> {
    return this.getUsers({ page: 1, limit: UserService.EXPORT_PAGE_SIZE }).pipe(
      switchMap((first) => {
        if (first.totalPages <= 1) return of(first.data);
        const remainingPages = Array.from({ length: first.totalPages - 1 }, (_, i) =>
          this.getUsers({ page: i + 2, limit: UserService.EXPORT_PAGE_SIZE }),
        );
        return forkJoin(remainingPages).pipe(
          map((pages) => [...first.data, ...pages.flatMap((p) => p.data)]),
        );
      }),
    );
  }
}
