import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  ApprovalStatus, Business, BusinessCategory, VisibilityType,
  OpeningDayKey, PaginatedResponse,
} from '../models';
import { FORM_DATA_FIELD_NAMES } from '../constants/upload.constants';

/** Files for a business create/update, one bag per gallery plus the logo. */
export interface BusinessFilePayload {
  /** Gallery Photos. */
  images?: File[];
  menuImages?: File[];
  cardImages?: File[];
  logo?: File;
}

export interface BusinessQueryParams {
  categoryId?: string;
  /** Comma-separated category ids — the multi-select category filter. */
  categoryIds?: string;
  page?: number;
  limit?: number;
  search?: string;
  /** Free-text country match. Prefer `countryIds`. */
  country?: string;
  /** Comma-separated master_countries ids. */
  countryIds?: string;
  stateId?: number;
  cityId?: number;
  visibilityType?: VisibilityType;
  /** "Open on <day>" — a day key such as `TUE`. */
  openOnDay?: OpeningDayKey;
  /**
   * "Open now". Businesses carry no timezone, so the *viewer's* current day
   * and `HH:mm` are sent explicitly rather than the server using its clock.
   */
  openNowDay?: OpeningDayKey;
  openNowTime?: string;
  /**
   * Feature-presence toggles. Only set these when true — api.get() strips
   * ''/null/undefined but a literal `false` would survive and be parsed as
   * an active filter.
   */
  hasMenu?: boolean;
  hasGallery?: boolean;
  hasWhatsapp?: boolean;
  hasWebsite?: boolean;
  dateFrom?: string;
  dateTo?: string;
  pincode?: string;
  status?: 'active' | 'inactive' | '';
  sortBy?: string;
  sortDir?: string;
}

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

  /** `activeOnly` excludes a deprioritised category — pass it from the
   * Add/Edit Business form's category picker so a category like "Bar" (kept
   * only because an existing business still references it) can't be chosen
   * for a new or edited business. */
  getCategories(activeOnly = false): Observable<BusinessCategory[]> {
    return this.api.get<BusinessCategory[]>('/business/categories', activeOnly ? { activeOnly: 'true' } : {});
  }

  createCategory(data: Partial<BusinessCategory>): Observable<BusinessCategory> {
    return this.api.post<BusinessCategory>('/business/categories', data);
  }

  getBusinesses(params: BusinessQueryParams): Observable<PaginatedResponse<Business>> {
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

  /**
   * Flattens the three galleries plus the logo into the repeated-field form
   * postWithFile/putWithFile expect.
   *
   * Note what is NOT here: an emptied gallery. Removing every image from a
   * gallery is expressed by the caller through the JSON-stringified
   * `existingImages` / `existingMenuImages` / `existingCardImages` fields in
   * `data`, because an empty file list is indistinguishable from an
   * untouched gallery once it reaches FormData.
   */
  private toFileParts(payload?: BusinessFilePayload): Array<{ field: string; file: File }> {
    const parts: Array<{ field: string; file: File }> = [];
    if (!payload) return parts;

    const galleries: Array<[string, File[] | undefined]> = [
      [FORM_DATA_FIELD_NAMES.IMAGES, payload.images],
      [FORM_DATA_FIELD_NAMES.MENU_IMAGES, payload.menuImages],
      [FORM_DATA_FIELD_NAMES.CARD_IMAGES, payload.cardImages],
    ];
    for (const [field, list] of galleries) {
      list?.forEach((file) => parts.push({ field, file }));
    }
    if (payload.logo) parts.push({ field: FORM_DATA_FIELD_NAMES.LOGO, file: payload.logo });

    return parts;
  }

  createBusiness(data: Record<string, any>, files?: BusinessFilePayload): Observable<Business> {
    const parts = this.toFileParts(files);
    return parts.length > 0
      ? this.api.postWithFile<Business>('/business', data, parts)
      : this.api.post<Business>('/business', data);
  }

  updateBusiness(id: string, data: Record<string, any>, files?: BusinessFilePayload): Observable<Business> {
    const parts = this.toFileParts(files);
    return parts.length > 0
      ? this.api.putWithFile<Business>(`/business/${id}`, data, parts)
      : this.api.put<Business>(`/business/${id}`, data);
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
