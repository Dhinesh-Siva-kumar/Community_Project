import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Business, BusinessCategory, PaginatedResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private api = inject(ApiService);

  getCategories(): Observable<BusinessCategory[]> {
    return this.api.get<BusinessCategory[]>('/business/categories');
  }

  createCategory(data: Partial<BusinessCategory>): Observable<BusinessCategory> {
    return this.api.post<BusinessCategory>('/business/categories', data);
  }

  getBusinesses(categoryId: string, pincode?: string): Observable<PaginatedResponse<Business>> {
    const params: Record<string, any> = { categoryId };
    if (pincode) {
      params['pincode'] = pincode;
    }
    return this.api.get<PaginatedResponse<Business>>('/business', params);
  }

  getBusiness(id: string): Observable<Business> {
    return this.api.get<Business>(`/business/${id}`);
  }

  createBusiness(data: Record<string, any>, images?: File[]): Observable<Business> {
    if (images && images.length > 0) {
      const files = images.map((file) => ({ field: 'images', file }));
      return this.api.postWithFile<Business>('/business', data, files);
    }
    return this.api.post<Business>('/business', data);
  }

  updateBusiness(id: string, data: Record<string, any>, images?: File[]): Observable<Business> {
    if (images && images.length > 0) {
      const files = images.map((file) => ({ field: 'images', file }));
      return this.api.putWithFile<Business>(`/business/${id}`, data, files);
    }
    return this.api.put<Business>(`/business/${id}`, data);
  }

  deleteBusiness(id: string): Observable<void> {
    return this.api.delete<void>(`/business/${id}`);
  }
}
