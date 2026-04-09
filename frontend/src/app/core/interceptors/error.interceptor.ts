import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

const ERROR_MESSAGES: Record<number, string> = {
  400: 'Bad request. Please check your input.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  408: 'Request timed out. Please try again.',
  409: 'A conflict occurred. The resource may have been modified.',
  422: 'The submitted data is invalid.',
  429: 'Too many requests. Please try again later.',
  500: 'An internal server error occurred. Please try again later.',
  502: 'Bad gateway. The server is temporarily unavailable.',
  503: 'Service unavailable. Please try again later.',
  504: 'Gateway timeout. The server took too long to respond.',
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        toastService.error('Unable to connect to the server. Please check your internet connection.');
        return throwError(() => error);
      }

      // Skip toast for 401 — handled by auth interceptor
      if (error.status === 401) {
        return throwError(() => error);
      }

      const serverMessage = error.error?.message;
      const fallbackMessage = ERROR_MESSAGES[error.status] || `An unexpected error occurred (${error.status}).`;
      const message = serverMessage || fallbackMessage;

      toastService.error(message);

      return throwError(() => error);
    })
  );
};
