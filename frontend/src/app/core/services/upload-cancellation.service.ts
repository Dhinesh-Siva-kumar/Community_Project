import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UploadCancellationService {
  private controllers = new Map<string, AbortController>();
  private uploadStatus$ = new BehaviorSubject<Map<string, { progress: number; cancelled: boolean }>>(new Map());

  /**
   * Create and store an AbortController for a specific upload
   */
  createAbortController(uploadId: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(uploadId, controller);
    this.setUploadProgress(uploadId, 0, false);
    return controller;
  }

  /**
   * Get the AbortSignal for a specific upload
   */
  getAbortSignal(uploadId: string): AbortSignal | undefined {
    return this.controllers.get(uploadId)?.signal;
  }

  /**
   * Cancel a specific upload by ID
   */
  cancelUpload(uploadId: string): void {
    const controller = this.controllers.get(uploadId);
    if (controller) {
      controller.abort();
      this.markAsCancelled(uploadId);
      // Keep the controller in map briefly to mark as cancelled, then remove
      setTimeout(() => {
        this.controllers.delete(uploadId);
      }, 100);
    }
  }

  /**
   * Cancel all ongoing uploads
   */
  cancelAll(): void {
    this.controllers.forEach(controller => controller.abort());
    const status = this.uploadStatus$.value;
    status.forEach((value, key) => {
      status.set(key, { ...value, cancelled: true });
    });
    this.uploadStatus$.next(status);
    this.controllers.clear();
  }

  /**
   * Set upload progress for a specific upload
   */
  setUploadProgress(uploadId: string, progress: number, cancelled: boolean = false): void {
    const status = this.uploadStatus$.value;
    status.set(uploadId, { progress, cancelled });
    this.uploadStatus$.next(status);
  }

  /**
   * Mark an upload as cancelled
   */
  private markAsCancelled(uploadId: string): void {
    const status = this.uploadStatus$.value;
    const existing = status.get(uploadId);
    if (existing) {
      status.set(uploadId, { ...existing, cancelled: true });
      this.uploadStatus$.next(status);
    }
  }

  /**
   * Get upload status observable
   */
  getUploadStatus$(): Observable<Map<string, { progress: number; cancelled: boolean }>> {
    return this.uploadStatus$.asObservable();
  }

  /**
   * Get progress for a specific upload
   */
  getProgress(uploadId: string): number {
    return this.uploadStatus$.value.get(uploadId)?.progress ?? 0;
  }

  /**
   * Check if upload is cancelled
   */
  isCancelled(uploadId: string): boolean {
    return this.uploadStatus$.value.get(uploadId)?.cancelled ?? false;
  }

  /**
   * Clear all upload status when upload completes
   */
  clearUploadStatus(uploadId: string): void {
    const status = this.uploadStatus$.value;
    status.delete(uploadId);
    this.uploadStatus$.next(status);
  }

  /**
   * Clear all upload statuses
   */
  clearAllStatus(): void {
    this.uploadStatus$.next(new Map());
  }
}
