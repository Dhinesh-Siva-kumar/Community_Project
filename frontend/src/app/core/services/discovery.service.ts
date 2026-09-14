import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { BusinessPreview, CommunityPreview, DiscoveryPlatformStats, DiscoverySearchResult, EventPreview, JobPreview, PostPreview } from '../models';

export interface DiscoveryPreviewParams {
  countryId?: number;
  limit?: number;
}

/** Calls the public, guest-facing `/discovery/*` endpoints that back the homepage. */
@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private api = inject(ApiService);

  getJobsPreview(params: DiscoveryPreviewParams = {}): Observable<{ data: JobPreview[] }> {
    return this.api.get<{ data: JobPreview[] }>('/discovery/jobs/preview', params);
  }

  getBusinessesPreview(params: DiscoveryPreviewParams = {}): Observable<{ data: BusinessPreview[] }> {
    return this.api.get<{ data: BusinessPreview[] }>('/discovery/businesses/preview', params);
  }

  getEventsPreview(params: DiscoveryPreviewParams = {}): Observable<{ data: EventPreview[] }> {
    return this.api.get<{ data: EventPreview[] }>('/discovery/events/preview', params);
  }

  getCommunitiesPreview(params: DiscoveryPreviewParams = {}): Observable<{ data: CommunityPreview[] }> {
    return this.api.get<{ data: CommunityPreview[] }>('/discovery/communities/preview', params);
  }

  getPostsPreview(params: DiscoveryPreviewParams = {}): Observable<{ data: PostPreview[] }> {
    return this.api.get<{ data: PostPreview[] }>('/discovery/posts/preview', params);
  }

  getPlatformStats(): Observable<{ data: DiscoveryPlatformStats }> {
    return this.api.get<{ data: DiscoveryPlatformStats }>('/discovery/stats');
  }

  search(q: string, countryId?: number, limit?: number): Observable<DiscoverySearchResult> {
    return this.api.get<DiscoverySearchResult>('/discovery/search', { q, countryId, limit });
  }
}
