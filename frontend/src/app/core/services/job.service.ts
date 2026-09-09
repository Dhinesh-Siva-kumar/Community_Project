import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApprovalStatus, Job, PaginatedResponse, VisibilityType } from '../models';
import { FORM_DATA_FIELD_NAMES } from '../constants/upload.constants';

export interface MyJobsQueryParams {
  page?:  number;
  limit?: number;
  search?: string;
  sortBy?: string;
  approvalStatus?: ApprovalStatus | ApprovalStatus[];
}

export interface PendingJobsQueryParams {
  page?:     number;
  limit?:    number;
  search?:   string;
  country?:  string;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:   'joined' | 'name';
  sortDir?:  'asc' | 'desc';
}

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
  /** Comma-separated master_countries ids — independent of the free-text `country` above. */
  countryIds?: string;
  stateId?:    number;
  cityId?:     number;

  // ── Visibility scope ───────────────────────────────────────────
  visibilityType?: VisibilityType;

  // ── Role filters ─────────────────────────────────────────────
  // Singular exact-match, kept for existing callers. jobTypes/workModes are
  // the multi-select CSV form.
  jobType?:   string;
  workMode?:  string;
  shiftType?: string;
  education?: string;
  jobTypes?:  string;
  workModes?: string;

  // ── Recruiter / poster search (admin) ─────────────────────────
  postedBy?: string;

  // ── Experience range ─────────────────────────────────────────
  expMin?: number;
  expMax?: number;

  // ── Salary ───────────────────────────────────────────────────
  salaryMin?:    number;
  salaryMax?:    number;
  salaryHidden?: boolean;

  // ── Date / Sort ──────────────────────────────────────────────
  postedWithin?: number;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?: 'newest' | 'oldest' | 'salary_high' | 'salary_low' | 'company_az'
    | 'title_az' | 'title_za' | 'location_az' | 'location_za'
    | 'type_az' | 'type_za' | 'status_active' | 'status_inactive'
    | 'approval_az' | 'approval_za';

  // ── Status (admin only) ───────────────────────────────────────
  status?: 'active' | 'inactive';
}

@Injectable({ providedIn: 'root' })
export class JobService {
  private api = inject(ApiService);

  getJobs(query: JobsQueryParams = {}): Observable<PaginatedResponse<Job>> {
    // Forward every param as-is — api.get() already strips null/undefined/''
    // values, so there's no need to cherry-pick fields into a fresh object
    // (which previously had to be kept in sync by hand every time a new
    // filter was added).
    return this.api.get<PaginatedResponse<Job>>('/jobs', query);
  }

  getJob(id: string): Observable<Job> {
    return this.api.get<Job>(`/jobs/${id}`);
  }

   createJob(data: Record<string, any>, images?: File[], logo?: File): Observable<Job> {
     const files: { field: string; file: File }[] = [];
     if (logo)           files.push({ field: FORM_DATA_FIELD_NAMES.LOGO,   file: logo });
     if (images?.length) images.forEach(f => files.push({ field: FORM_DATA_FIELD_NAMES.IMAGES, file: f }));
     if (files.length > 0) return this.api.postWithFile<Job>('/jobs', data, files);
     return this.api.post<Job>('/jobs', data);
   }

   updateJob(id: string, data: Record<string, any>, images?: File[], logo?: File): Observable<Job> {
     const files: { field: string; file: File }[] = [];
     if (logo)           files.push({ field: FORM_DATA_FIELD_NAMES.LOGO,   file: logo });
     if (images?.length) images.forEach(f => files.push({ field: FORM_DATA_FIELD_NAMES.IMAGES, file: f }));
     if (files.length > 0) return this.api.putWithFile<Job>(`/jobs/${id}`, data, files);
     return this.api.put<Job>(`/jobs/${id}`, data);
   }

  deleteJob(id: string): Observable<void> {
    return this.api.delete<void>(`/jobs/${id}`);
  }

  getMyJobs(params: MyJobsQueryParams = {}): Observable<PaginatedResponse<Job>> {
    const clean: Record<string, any> = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    });
    return this.api.get<PaginatedResponse<Job>>('/jobs/mine', clean);
  }

  approveJob(id: string): Observable<Job> {
    return this.api.put<Job>(`/jobs/${id}/approve`);
  }

  rejectJob(id: string, reason?: string): Observable<Job> {
    return this.api.put<Job>(`/jobs/${id}/reject`, reason ? { reason } : {});
  }

  requestMoreInfoJob(id: string, reason: string): Observable<Job> {
    return this.api.put<Job>(`/jobs/${id}/request-more-info`, { reason });
  }

  getPendingJobs(params?: PendingJobsQueryParams): Observable<PaginatedResponse<Job>> {
    const clean: Record<string, any> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      });
    }
    return this.api.get<PaginatedResponse<Job>>('/jobs/pending', clean);
  }

  getPendingJobsCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>('/jobs/pending-count');
  }
}
