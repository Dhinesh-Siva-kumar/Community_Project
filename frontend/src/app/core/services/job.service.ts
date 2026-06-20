import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Job, PaginatedResponse } from '../models';

export interface JobsQueryParams {
  // ── Pagination ───────────────────────────────────────────────
  pincode?: string;
  page?:    number;
  limit?:   number;

  // ── Text search ──────────────────────────────────────────────
  search?: string;

  // ── Location filters ─────────────────────────────────────────
  country?: string;
  state?:   string;
  city?:    string;

  // ── Role filters ─────────────────────────────────────────────
  jobType?:   string;
  workMode?:  string;
  shiftType?: string;
  education?: string;

  // ── Experience range ─────────────────────────────────────────
  expMin?: number;
  expMax?: number;

  // ── Salary ───────────────────────────────────────────────────
  salaryMin?:    number;
  salaryMax?:    number;
  salaryHidden?: boolean;

  // ── Date / Sort ──────────────────────────────────────────────
  postedWithin?: number;
  sortBy?: 'newest' | 'oldest' | 'salary_high' | 'salary_low' | 'company_az';
}

@Injectable({ providedIn: 'root' })
export class JobService {
  private api = inject(ApiService);

  getJobs(query: JobsQueryParams = {}): Observable<PaginatedResponse<Job>> {
    const params: Record<string, any> = {};

    if (query.pincode)              params['pincode']       = query.pincode;
    if (query.page && query.page > 1) params['page']        = query.page;
    if (query.limit)                params['limit']         = query.limit;
    if (query.search)               params['search']        = query.search;
    if (query.country)              params['country']       = query.country;
    if (query.state)                params['state']         = query.state;
    if (query.city)                 params['city']          = query.city;
    if (query.jobType)              params['jobType']       = query.jobType;
    if (query.workMode)             params['workMode']      = query.workMode;
    if (query.shiftType)            params['shiftType']     = query.shiftType;
    if (query.education)            params['education']     = query.education;
    if (query.expMin != null)       params['expMin']        = query.expMin;
    if (query.expMax != null)       params['expMax']        = query.expMax;
    if (query.salaryMin != null)    params['salaryMin']     = query.salaryMin;
    if (query.salaryMax != null)    params['salaryMax']     = query.salaryMax;
    if (query.salaryHidden != null) params['salaryHidden']  = query.salaryHidden;
    if (query.postedWithin != null) params['postedWithin']  = query.postedWithin;
    if (query.sortBy && query.sortBy !== 'newest') params['sortBy'] = query.sortBy;

    return this.api.get<PaginatedResponse<Job>>('/jobs', params);
  }

  getJob(id: string): Observable<Job> {
    return this.api.get<Job>(`/jobs/${id}`);
  }

  createJob(data: Record<string, any>, images?: File[], logo?: File): Observable<Job> {
    const files: { field: string; file: File }[] = [];
    if (logo)           files.push({ field: 'logo',   file: logo });
    if (images?.length) images.forEach(f => files.push({ field: 'images', file: f }));
    if (files.length > 0) return this.api.postWithFile<Job>('/jobs', data, files);
    return this.api.post<Job>('/jobs', data);
  }

  updateJob(id: string, data: Record<string, any>, images?: File[], logo?: File): Observable<Job> {
    const files: { field: string; file: File }[] = [];
    if (logo)           files.push({ field: 'logo',   file: logo });
    if (images?.length) images.forEach(f => files.push({ field: 'images', file: f }));
    if (files.length > 0) return this.api.putWithFile<Job>(`/jobs/${id}`, data, files);
    return this.api.put<Job>(`/jobs/${id}`, data);
  }

  deleteJob(id: string): Observable<void> {
    return this.api.delete<void>(`/jobs/${id}`);
  }
}
