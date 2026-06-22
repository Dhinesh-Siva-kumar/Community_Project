import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  User, UserDetail, UserListResponse, AuditLog, AuditLogResponse,
  NotificationType, PaginatedResponse, DashboardStats, ChartData,
} from '../models';

export interface AdminCreateUserPayload {
  userName:    string;
  displayName: string;
  email?:      string;
  phoneNo?:    string;
  password:    string;
  role:        'ADMIN' | 'USER';
  countryId?:  number;
}

export interface UserFilterParams {
  page?:   number;
  limit?:  number;
  search?: string;
  role?:   'ADMIN' | 'USER' | '';
  status?: 'active' | 'blocked' | 'trusted' | '';
  joined?: 'today' | '7d' | '30d' | '90d' | '';
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
      return this.api.putWithFile<User>('/users/profile', data, [{ field: 'avatar', file: avatar }]);
    }
    return this.api.put<User>('/users/profile', data);
  }

  getDashboardStats(): Observable<DashboardStats> {
    return this.api.get<DashboardStats>('/users/dashboard');
  }

  getChartData(): Observable<ChartData> {
    return this.api.get<ChartData>('/users/charts');
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

  changeUserRole(id: string, role: 'ADMIN' | 'USER'): Observable<User> {
    return this.api.put<User>(`/users/${id}/role`, { role });
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
  getAuditLogs(params?: { page?: number; limit?: number; action?: string }): Observable<AuditLogResponse> {
    return this.api.get<AuditLogResponse>('/users/audit-logs', params ?? {});
  }

  broadcastNotification(payload: BroadcastPayload): Observable<{ success: boolean; sent: number }> {
    return this.api.post<{ success: boolean; sent: number }>('/users/broadcast', payload);
  }

  // ── Admin — export ────────────────────────────────────────────────────────
  exportUsers(params?: UserFilterParams): Observable<UserListResponse> {
    return this.getUsers({ ...params, limit: 9999, page: 1 });
  }
}
