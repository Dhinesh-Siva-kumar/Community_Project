import { Injectable } from '@angular/core';

/**
 * BlobUrlManager Service
 * 
 * Manages creation and cleanup of Object URLs for file previews.
 * This prevents memory leaks from DataURL usage (FileReader.readAsDataURL).
 * 
 * Key Benefits:
 * - Object URLs use significantly less memory than Data URLs
 * - Explicit cleanup with URL.revokeObjectURL prevents memory leaks
 * - Solves issue where 50+ image uploads can consume 100MB+ RAM
 * 
 * Usage:
 * - Instead of: FileReader.readAsDataURL() -> Store data URL -> Memory leak
 * - Use: blobUrlManager.createBlobUrl(file) -> Store blob URL -> Clean up on destroy
 */
@Injectable({
  providedIn: 'root'
})
export class BlobUrlManagerService {
  private createdUrls: Set<string> = new Set();

  /**
   * Create a blob URL from a File object
   * Much more memory-efficient than FileReader.readAsDataURL()
   * @param file The File object to create URL from
   * @returns Object URL string that can be used in img src, etc.
   */
  createBlobUrl(file: File): string {
    const url = URL.createObjectURL(file);
    this.createdUrls.add(url);
    return url;
  }

  /**
   * Revoke a single blob URL and free memory
   * Must be called when component destroys or modal closes
   * @param url The object URL to revoke
   */
  revokeBlobUrl(url: string): void {
    if (url && this.createdUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.createdUrls.delete(url);
    }
  }

  /**
   * Revoke multiple blob URLs at once
   * Use this in ngOnDestroy or modal close handlers
   * @param urls Array of object URLs to revoke
   */
  revokeAllUrls(urls: string[]): void {
    urls.forEach(url => this.revokeBlobUrl(url));
  }

  /**
   * Get count of currently managed URLs (for debugging)
   * @returns Number of active blob URLs
   */
  getActiveUrlCount(): number {
    return this.createdUrls.size;
  }

  /**
   * Clear all managed URLs (emergency cleanup)
   * Use this in ngOnDestroy if revokeAllUrls wasn't called properly
   */
  clearAllUrls(): void {
    this.createdUrls.forEach(url => URL.revokeObjectURL(url));
    this.createdUrls.clear();
  }
}
