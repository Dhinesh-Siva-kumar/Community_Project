import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Event, PaginatedResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class EventService {
  private api = inject(ApiService);

  getEvents(pincode?: string): Observable<PaginatedResponse<Event>> {
    const params: Record<string, any> = {};
    if (pincode) {
      params['pincode'] = pincode;
    }
    return this.api.get<PaginatedResponse<Event>>('/events', params);
  }

  getEvent(id: string): Observable<Event> {
    return this.api.get<Event>(`/events/${id}`);
  }

  createEvent(data: Record<string, any>, images?: File[]): Observable<Event> {
    if (images && images.length > 0) {
      const files = images.map((file) => ({ field: 'images', file }));
      return this.api.postWithFile<Event>('/events', data, files);
    }
    return this.api.post<Event>('/events', data);
  }

  updateEvent(id: string, data: Record<string, any>, images?: File[]): Observable<Event> {
    if (images && images.length > 0) {
      const files = images.map((file) => ({ field: 'images', file }));
      return this.api.putWithFile<Event>(`/events/${id}`, data, files);
    }
    return this.api.put<Event>(`/events/${id}`, data);
  }

  deleteEvent(id: string): Observable<void> {
    return this.api.delete<void>(`/events/${id}`);
  }
}
