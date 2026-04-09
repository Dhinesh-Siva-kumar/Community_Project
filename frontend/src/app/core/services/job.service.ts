import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Job, PaginatedResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class JobService {
  private api = inject(ApiService);

  getJobs(pincode?: string): Observable<PaginatedResponse<Job>> {
    const params: Record<string, any> = {};
    if (pincode) {
      params['pincode'] = pincode;
    }
    return this.api.get<PaginatedResponse<Job>>('/jobs', params);
  }

  getJob(id: string): Observable<Job> {
    return this.api.get<Job>(`/jobs/${id}`);
  }

  createJob(data: Record<string, any>, images?: File[]): Observable<Job> {
    if (images && images.length > 0) {
      const files = images.map((file) => ({ field: 'images', file }));
      return this.api.postWithFile<Job>('/jobs', data, files);
    }
    return this.api.post<Job>('/jobs', data);
  }

  updateJob(id: string, data: Record<string, any>, images?: File[]): Observable<Job> {
    if (images && images.length > 0) {
      const files = images.map((file) => ({ field: 'images', file }));
      return this.api.putWithFile<Job>(`/jobs/${id}`, data, files);
    }
    return this.api.put<Job>(`/jobs/${id}`, data);
  }

  deleteJob(id: string): Observable<void> {
    return this.api.delete<void>(`/jobs/${id}`);
  }
}
