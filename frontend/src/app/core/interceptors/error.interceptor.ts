import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/** Status codes with a translated fallback under `errors.http.*`. */
const KNOWN_STATUSES = new Set([400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504]);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);
  const translate = inject(TranslateService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        toastService.error('errors.http.offline');
        return throwError(() => error);
      }

      // Skip toast for 401 — handled by auth interceptor
      if (error.status === 401) {
        return throwError(() => error);
      }

      toastService.error(resolveMessage(error, translate));

      return throwError(() => error);
    })
  );
};

/**
 * Precedence: the backend's error `code` (translatable) beats the status-code
 * fallback, which beats the server's raw `message`. The raw message is English
 * only, so it is a last resort rather than — as it used to be — the first
 * choice.
 */
function resolveMessage(error: HttpErrorResponse, translate: TranslateService): string {
  const code: unknown = error.error?.code;
  if (typeof code === 'string' && code) {
    const key = `errors.code.${code}`;
    const translated = translate.instant(key);
    if (typeof translated === 'string' && translated !== key) return translated;
  }

  if (KNOWN_STATUSES.has(error.status)) {
    return translate.instant(`errors.http.${error.status}`) as string;
  }

  const serverMessage: unknown = error.error?.message;
  if (typeof serverMessage === 'string' && serverMessage) return serverMessage;

  return translate.instant('errors.http.unknown', { status: error.status }) as string;
}
