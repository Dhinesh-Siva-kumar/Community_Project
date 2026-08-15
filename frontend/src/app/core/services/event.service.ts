import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Event, PaginatedResponse } from '../models';
import { FORM_DATA_FIELD_NAMES } from '../constants/upload.constants';

export interface EventsQueryParams {
  pincode?:     string;
  /** Used only with sortBy='near' — events matching this pincode sort first; does not filter results. */
  nearPincode?: string;
  eventMode?:   'Offline' | 'Online' | 'Hybrid';
  page?:        number;
  limit?:       number;
  search?:      string;
  country?:     string;
  status?:      'active' | 'inactive';
  dateFrom?:    string;
  dateTo?:      string;
  /** Filters on event_date (when the event happens), unlike dateFrom/dateTo which filter created_at. */
  eventDateFrom?: string;
  eventDateTo?:   string;
  sortBy?:      'name' | 'eventDate' | 'joined' | 'near';
  sortDir?:     'asc' | 'desc';
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private api = inject(ApiService);

  getEvents(params: EventsQueryParams = {}): Observable<PaginatedResponse<Event>> {
    const clean: Record<string, any> = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    });
    return this.api.get<PaginatedResponse<Event>>('/events', clean);
  }

  getEvent(id: string): Observable<Event> {
    return this.api.get<Event>(`/events/${id}`);
  }

   createEvent(data: Record<string, any>, images?: File[]): Observable<Event> {
     if (images && images.length > 0) {
       const files = images.map((file) => ({ field: FORM_DATA_FIELD_NAMES.IMAGES, file }));
       return this.api.postWithFile<Event>('/events', data, files);
     }
     return this.api.post<Event>('/events', data);
   }

   updateEvent(id: string, data: Record<string, any>, images?: File[]): Observable<Event> {
     if (images && images.length > 0) {
       const files = images.map((file) => ({ field: FORM_DATA_FIELD_NAMES.IMAGES, file }));
       return this.api.putWithFile<Event>(`/events/${id}`, data, files);
     }
     return this.api.put<Event>(`/events/${id}`, data);
   }

  deleteEvent(id: string): Observable<void> {
    return this.api.delete<void>(`/events/${id}`);
  }
}
