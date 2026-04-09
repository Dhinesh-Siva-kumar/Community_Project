import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Community, CommunityMember, CommunityRequest, PaginatedResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private api = inject(ApiService);

  getCommunities(params?: Record<string, any>): Observable<PaginatedResponse<Community>> {
    return this.api.get<PaginatedResponse<Community>>('/communities', params);
  }

  getCommunity(id: string): Observable<Community> {
    return this.api.get<Community>(`/communities/${id}`);
  }

  createCommunity(data: Partial<CommunityRequest>): Observable<Community> {
    return this.api.post<Community>('/communities', data);
  }

  updateCommunity(id: string, data: Partial<CommunityRequest>): Observable<Community> {
    return this.api.put<Community>(`/communities/${id}`, data);
  }

  deleteCommunity(id: string): Observable<void> {
    return this.api.delete<void>(`/communities/${id}`);
  }

  joinCommunity(id: string): Observable<any> {
    return this.api.post<any>(`/communities/${id}/join`);
  }

  leaveCommunity(id: string): Observable<void> {
    return this.api.post<void>(`/communities/${id}/leave`);
  }

  getMembers(communityId: string): Observable<CommunityMember[]> {
    return this.api.get<CommunityMember[]>(`/communities/${communityId}/members`);
  }
}
