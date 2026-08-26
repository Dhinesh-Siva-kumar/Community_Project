import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, catchError, of } from 'rxjs';

/**
 * Loads the translation catalogs from `public/assets/i18n/<lang>.json`.
 *
 * Built on `HttpBackend` rather than `HttpClient` so the auth and error
 * interceptors never run for catalog requests: the catalogs are static assets
 * that need no bearer token, and a failed fetch must not raise a toast (the
 * toast text itself would be unavailable at that point).
 */
@Injectable({ providedIn: 'root' })
export class JsonTranslateLoader implements TranslateLoader {
  private http = new HttpClient(inject(HttpBackend));

  getTranslation(lang: string): Observable<TranslationObject> {
    // Absolute path — a relative one would resolve against the current route
    // (e.g. /user/assets/i18n/en.json) instead of the app root.
    return this.http
      .get<TranslationObject>(`/assets/i18n/${lang}.json`)
      .pipe(catchError(() => of({} as TranslationObject)));
  }
}
