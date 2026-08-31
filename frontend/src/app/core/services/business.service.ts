import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApprovalStatus, Business, BusinessCategory, PaginatedResponse } from '../models';
import { FORM_DATA_FIELD_NAMES } from '../constants/upload.constants';

export interface PendingBusinessQueryParams {
  page?:     number;
  limit?:    number;
  search?:   string;
  country?:  string;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:   'joined' | 'name';
  sortDir?:  'asc' | 'desc';
}

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private api = inject(ApiService);

  getCategories(): Observable<BusinessCategory[]> {
    return this.api.get<BusinessCategory[]>('/business/categories');
  }

  createCategory(data: Partial<BusinessCategory>): Observable<BusinessCategory> {
    return this.api.post<BusinessCategory>('/business/categories', data);
  }

  getBusinesses(params: {
    categoryId?: string;
    categoryIds?: string;
    page?: number;
    limit?: number;
    search?: string;
    country?: string;
    openingHours?: string;
    dateFrom?: string;
    dateTo?: string;
    pincode?: string;
    status?: 'active' | 'inactive' | '';
    sortBy?: string;
    sortDir?: string;
  }): Observable<PaginatedResponse<Business>> {
    // Forward every param as-is — api.get() already strips null/undefined/''
    // values. Previously this cherry-picked individual fields into a fresh
    // object and silently dropped `status`, `limit`, `sortBy` and `sortDir`
    // even though callers passed them, so the Status filter (and page size /
    // sorting) had no effect on the request.
    return this.api.get<PaginatedResponse<Business>>('/business', params);
  }

  getBusiness(id: string): Observable<Business> {
    return this.api.get<Business>(`/business/${id}`);
  }

  getMyBusinesses(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    approvalStatus?: ApprovalStatus | ApprovalStatus[];
  } = {}): Observable<PaginatedResponse<Business>> {
    return this.api.get<PaginatedResponse<Business>>('/business/mine', params);
  }

  approveBusiness(id: string): Observable<Business> {
    return this.api.put<Business>(`/business/${id}/approve`);
  }

  rejectBusiness(id: string, reason?: string): Observable<Business> {
    return this.api.put<Business>(`/business/${id}/reject`, reason ? { reason } : {});
  }

  requestMoreInfoBusiness(id: string, reason: string): Observable<Business> {
    return this.api.put<Business>(`/business/${id}/request-more-info`, { reason });
  }

  getPendingBusinesses(params?: PendingBusinessQueryParams): Observable<PaginatedResponse<Business>> {
    const clean: Record<string, any> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      });
    }
    return this.api.get<PaginatedResponse<Business>>('/business/pending', clean);
  }

  getPendingBusinessesCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>('/business/pending-count');
  }

   createBusiness(data: Record<string, any>, images?: File[], logo?: File): Observable<Business> {
     const files: Array<{ field: string; file: File }> = [];
     if (images && images.length > 0) {
       images.forEach((file) => files.push({ field: FORM_DATA_FIELD_NAMES.IMAGES, file }));
     }
     if (logo) {
       files.push({ field: 'logo', file: logo });
     }
     if (files.length > 0) {
       return this.api.postWithFile<Business>('/business', data, files);
     }
     return this.api.post<Business>('/business', data);
   }

   updateBusiness(id: string, data: Record<string, any>, images?: File[], logo?: File): Observable<Business> {
     const files: Array<{ field: string; file: File }> = [];
     if (images && images.length > 0) {
       images.forEach((file) => files.push({ field: FORM_DATA_FIELD_NAMES.IMAGES, file }));
     }
     if (logo) {
       files.push({ field: 'logo', file: logo });
     }
     if (files.length > 0) {
       return this.api.putWithFile<Business>(`/business/${id}`, data, files);
     }
     return this.api.put<Business>(`/business/${id}`, data);
   }

  deleteBusiness(id: string): Observable<void> {
    return this.api.delete<void>(`/business/${id}`);
  }

  updateCategory(id: string, data: Partial<BusinessCategory>): Observable<BusinessCategory> {
    return this.api.put<BusinessCategory>(`/business/categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/business/categories/${id}`);
  }
}
