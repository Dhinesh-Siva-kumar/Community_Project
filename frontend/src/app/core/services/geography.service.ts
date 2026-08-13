import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { CountryAddressConfig, Division, GeoCity, GeoCountry, PaginatedResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class GeographyService {
  private api = inject(ApiService);

  /** All countries, with postal-code format/regex for dynamic validation. */
  getCountries(): Observable<GeoCountry[]> {
    return this.api.get<{ data: GeoCountry[] }>('/geography/countries').pipe(
      map(res => res.data ?? [])
    );
  }

  /** How many division dropdowns a country needs, their labels, and whether it uses postal codes. */
  getCountryConfig(countryId: number): Observable<CountryAddressConfig> {
    return this.api.get<CountryAddressConfig>(`/geography/countries/${countryId}/config`);
  }

  /** Top-level divisions for a country (no parentId), or a division's children (parentId). */
  getDivisions(countryId: number, parentId?: number): Observable<Division[]> {
    const params: Record<string, any> = {};
    if (parentId) params['parentId'] = parentId;
    return this.api.get<{ data: Division[] }>(`/geography/countries/${countryId}/divisions`, params).pipe(
      map(res => res.data ?? [])
    );
  }

  /** Searchable, paginated cities — always scoped by division or country, never the full worldwide list. */
  searchCities(params: { divisionId?: number; countryId?: number; search?: string; page?: number; limit?: number }): Observable<PaginatedResponse<GeoCity>> {
    return this.api.get<PaginatedResponse<GeoCity>>('/geography/cities', params);
  }
}
