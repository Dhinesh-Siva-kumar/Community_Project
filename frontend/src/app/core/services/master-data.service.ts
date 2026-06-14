import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';

export interface MasterState {
  id: number;
  name: string;
  countryId: number;
}

export interface MasterCity {
  id: number;
  name: string;
  stateId: number;
}

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private api = inject(ApiService);

  /** Returns all countries from master_countries table */
  getCountries(): Observable<any[]> {
    return this.api.get<{ data: any[] }>('/master-data/countries').pipe(
      map(res => res.data ?? [])
    );
  }

  /** Returns states for a given countryId */
  getStates(countryId: number): Observable<MasterState[]> {
    return this.api.get<{ data: MasterState[] }>('/master-data/states', { countryId }).pipe(
      map(res => res.data ?? [])
    );
  }

  /** Returns cities for a given stateId */
  getCities(stateId: number): Observable<MasterCity[]> {
    return this.api.get<{ data: MasterCity[] }>('/master-data/cities', { stateId }).pipe(
      map(res => res.data ?? [])
    );
  }
}
