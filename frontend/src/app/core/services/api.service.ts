import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  get<T>(path: string, params: Record<string, any> = {}): Observable<T> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value !== null && value !== undefined && value !== '') {
        httpParams = httpParams.set(key, value.toString());
      }
    });
    return this.http.get<T>(`${this.baseUrl}${path}`, { params: httpParams });
  }

  post<T>(path: string, body: object = {}): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body);
  }

  put<T>(path: string, body: object = {}): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body);
  }

  patch<T>(path: string, body: object = {}): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`);
  }

  postWithFile<T>(path: string, data: Record<string, any>, files: { field: string; file: File }[] = []): Observable<T> {
    const formData = new FormData();

    files.forEach(({ field, file }) => {
      formData.append(field, file, file.name);
    });

    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((item) => formData.append(key, item));
        } else {
          formData.append(key, value);
        }
      }
    });

    return this.http.post<T>(`${this.baseUrl}${path}`, formData);
  }

  putWithFile<T>(path: string, data: Record<string, any>, files: { field: string; file: File }[] = []): Observable<T> {
    const formData = new FormData();

    files.forEach(({ field, file }) => {
      formData.append(field, file, file.name);
    });

    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((item) => formData.append(key, item));
        } else {
          formData.append(key, value);
        }
      }
    });

    return this.http.put<T>(`${this.baseUrl}${path}`, formData);
  }
}
