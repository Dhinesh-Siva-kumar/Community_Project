import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuditLog, AuditLogResponse } from '../models';

export interface AuditLogFilterParams {
  page?:     number;
  limit?:    number;
  action?:   string;
  resource?: string;
  /** Actor id — who performed the action. */
  userId?:   string;
  dateFrom?: string;
  dateTo?:   string;
}

export interface AuditLogActor {
  id:          string;
  displayName: string;
  userName:    string;
  avatar:      string | null;
}

export interface AuditLogFacets {
  actions:   string[];
  resources: string[];
  actors:    AuditLogActor[];
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private static readonly EXPORT_PAGE_SIZE = 100;

  private api = inject(ApiService);

  getAuditLogs(params: AuditLogFilterParams = {}): Observable<AuditLogResponse> {
    return this.api.get<AuditLogResponse>('/audit-logs', params as Record<string, unknown>);
  }

  getFacets(): Observable<AuditLogFacets> {
    return this.api.get<AuditLogFacets>('/audit-logs/facets');
  }

  /** Fetches every page matching the given filters — used for CSV/Excel export. */
  exportAllLogs(filters: AuditLogFilterParams = {}): Observable<AuditLog[]> {
    const base = { ...filters, page: 1, limit: AuditService.EXPORT_PAGE_SIZE };
    return this.getAuditLogs(base).pipe(
      switchMap((first) => {
        if (first.totalPages <= 1) return of(first.data);
        const remainingPages = Array.from({ length: first.totalPages - 1 }, (_, i) =>
          this.getAuditLogs({ ...base, page: i + 2 }),
        );
        return forkJoin(remainingPages).pipe(
          map((pages) => [...first.data, ...pages.flatMap((p) => p.data)]),
        );
      }),
    );
  }
}
