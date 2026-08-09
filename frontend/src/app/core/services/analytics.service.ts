import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface AnalyticsSeries {
  labels: string[];
  data: number[];
}

export interface AnalyticsOverview {
  granularity: AnalyticsGranularity;
  range: { from: string; to: string };
  userGrowth: AnalyticsSeries;
  activeUsers: { today: number; thisWeek: number; thisMonth: number };
  countryDistribution: { country: string; count: number }[];
  jobActivity: { posted: AnalyticsSeries; active: number; inactive: number };
  businessGrowth: { registered: AnalyticsSeries; verified: number; active: number; total: number };
  communityEngagement: { posts: AnalyticsSeries; comments: AnalyticsSeries; reactions: AnalyticsSeries };
  retentionRate: { rate: number; eligible: number; returned: number };
}

export interface AnalyticsOverviewParams {
  from?: string;
  to?: string;
  granularity?: AnalyticsGranularity;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private api = inject(ApiService);

  getOverview(params: AnalyticsOverviewParams): Observable<AnalyticsOverview> {
    const clean: Record<string, any> = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    });
    return this.api.get<AnalyticsOverview>('/analytics/overview', clean);
  }
}
