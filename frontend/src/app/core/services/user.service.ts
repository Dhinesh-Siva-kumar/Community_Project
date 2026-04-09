import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { User, PaginatedResponse, DashboardStats } from '../models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private api = inject(ApiService);

  getProfile(): Observable<User> {
    return this.api.get<User>('/users/profile');
  }

  updateProfile(data: Record<string, any>, avatar?: File): Observable<User> {
    if (avatar) {
      const files = [{ field: 'avatar', file: avatar }];
      return this.api.putWithFile<User>('/users/profile', data, files);
    }
    return this.api.put<User>('/users/profile', data);
  }

  getUsers(params?: Record<string, any>): Observable<PaginatedResponse<User>> {
    return this.api.get<PaginatedResponse<User>>('/users', params);
  }

  blockUser(id: string): Observable<User> {
    return this.api.put<User>(`/users/${id}/block`);
  }

  unblockUser(id: string): Observable<User> {
    return this.api.put<User>(`/users/${id}/unblock`);
  }

  trustUser(id: string): Observable<User> {
    return this.api.put<User>(`/users/${id}/trust`);
  }

  untrustUser(id: string): Observable<User> {
    return this.api.put<User>(`/users/${id}/untrust`);
  }

  getDashboardStats(): Observable<DashboardStats> {
    return this.api.get<DashboardStats>('/users/dashboard');
  }
}
