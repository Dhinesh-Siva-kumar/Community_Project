import { Injectable } from '@angular/core';
import { Observable, throwError, timer, of } from 'rxjs';
import { catchError, retryWhen, mergeMap } from 'rxjs/operators';
import { ToastService } from './toast.service';

/**
 * Retry configuration for upload operations
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration: exponential backoff
 * Attempt 1: immediate
 * Attempt 2: 1s delay
 * Attempt 3: 2s delay
 * Attempt 4: 4s delay
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

@Injectable({
  providedIn: 'root',
})
export class RetryService {
  private attemptCount = 0;

  constructor(private toast: ToastService) {}

  /**
   * Wraps an observable with exponential backoff retry logic
   * Automatically retries transient network failures
   * Shows user feedback on retry attempts
   */
  retryWithBackoff<T>(
    source$: Observable<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    operationName: string = 'Operation'
  ): Observable<T> {
    this.attemptCount = 0;

    return source$.pipe(
      retryWhen((errors) =>
        errors.pipe(
          mergeMap((error: any, index: number) => {
            this.attemptCount = index + 1;
            const isTransient = this.isTransientError(error);

            if (!isTransient) {
              // Don't retry non-transient errors (validation, auth, etc.)
              return throwError(() => error);
            }

            if (this.attemptCount > config.maxRetries) {
              // Max retries exceeded
              const finalError = new Error(
                `${operationName} failed after ${config.maxRetries} attempts. Please check your connection and try again.`
              );
              this.toast.error(finalError.message);
              return throwError(() => finalError);
            }

            // Calculate delay with exponential backoff
            const delayMs = Math.min(
              config.initialDelayMs * Math.pow(config.backoffMultiplier, this.attemptCount - 1),
              config.maxDelayMs
            );

            this.toast.info(
              `${operationName} failed. Retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${this.attemptCount}/${config.maxRetries})`
            );

            return timer(delayMs);
          })
        )
      ),
      catchError((error) => this.handleError(error, operationName))
    );
  }

  /**
   * Determines if an error is transient (safe to retry) or permanent
   */
  private isTransientError(error: any): boolean {
    // Network errors are always transient
    if (error.status === 0) return true;

    // HTTP status codes that indicate transient errors
    const transientStatusCodes = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ];

    return transientStatusCodes.includes(error.status);
  }

  /**
   * Centralized error handling
   */
  private handleError(error: any, operationName: string): Observable<never> {
    let errorMessage = `${operationName} failed`;

    if (error.status === 0) {
      errorMessage += ': Network error. Please check your connection.';
    } else if (error.status >= 400 && error.status < 500) {
      errorMessage += `: ${error.error?.message || 'Invalid request'}`;
    } else if (error.status >= 500) {
      errorMessage += ': Server error. Please try again later.';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage += `: ${error.error?.message || error.message || 'Unknown error'}`;
    }

    console.error(`[${operationName}]`, error);
    return throwError(() => new Error(errorMessage));
  }
}
