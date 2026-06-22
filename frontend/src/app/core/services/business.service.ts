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

  getBusinesses(params: {
    categoryId?: string;
    page?: number;
    search?: string;
    country?: string;
    openingHours?: string;
    dateFrom?: string;
    dateTo?: string;
    pincode?: string;
  }): Observable<PaginatedResponse<Business>> {
    const query: Record<string, any> = {};
    if (params.categoryId) query['categoryId'] = params.categoryId;
    if (params.page) query['page'] = params.page;
    if (params.search) query['search'] = params.search;
    if (params.country) query['country'] = params.country;
    if (params.openingHours) query['openingHours'] = params.openingHours;
    if (params.dateFrom) query['dateFrom'] = params.dateFrom;
    if (params.dateTo) query['dateTo'] = params.dateTo;
    if (params.pincode) query['pincode'] = params.pincode;
    return this.api.get<PaginatedResponse<Business>>('/business', query);
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

  updateCategory(id: string, data: Partial<BusinessCategory>): Observable<BusinessCategory> {
    return this.api.put<BusinessCategory>(`/business/categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/business/categories/${id}`);
  }
}
