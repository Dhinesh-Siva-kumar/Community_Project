import { Injectable } from '@angular/core';

export interface ImageUploadValidationResult {
  valid: boolean;
  message?: string;
  currentCount?: number;
  maxAllowed?: number;
  canAdd?: number;
}

export interface ImageUploadLimits {
  business: number;
  jobLogo: number;
  jobImages: number;
  event: number;
  post: number;
}

@Injectable({
  providedIn: 'root',
})
export class ImageUploadValidatorService {
  // Define maximum image limits per entity type
  private readonly LIMITS: ImageUploadLimits = {
    business: 10,
    jobLogo: 1,
    jobImages: 10,
    event: 10,
    post: 10,
  };

  /**
   * Validates if the new image count is within limits
   *
   * On CREATE: newImages.length <= maxAllowed ✓
   * On EDIT with new images: total count = existing.length + new.length must be <= maxAllowed
   *
   * @param newImages - Array of newly selected File objects
   * @param existingImages - Array of existing image URLs from database
   * @param maxAllowed - Maximum allowed number of images
   * @param operationType - 'create' or 'edit'
   * @returns Validation result with status and message
   */
  validateImageCount(
    newImages: File[],
    existingImages: string[],
    maxAllowed: number,
    operationType: 'create' | 'edit'
  ): ImageUploadValidationResult {
    const newCount = newImages.length;
    const existingCount = existingImages.length;

    if (operationType === 'create') {
      // For create: only new images count
      if (newCount > maxAllowed) {
        return {
          valid: false,
          message: `You can upload a maximum of ${maxAllowed} image${maxAllowed !== 1 ? 's' : ''}. You have selected ${newCount}.`,
          currentCount: newCount,
          maxAllowed,
          canAdd: 0,
        };
      }

      // Approaching limit warning
      if (newCount >= maxAllowed - 1) {
        return {
          valid: true,
          message: `You have ${newCount}/${maxAllowed} slots used.`,
          currentCount: newCount,
          maxAllowed,
          canAdd: maxAllowed - newCount,
        };
      }

      return {
        valid: true,
        currentCount: newCount,
        maxAllowed,
        canAdd: maxAllowed - newCount,
      };
    }

    // For edit: existing + new must not exceed max
    const totalCount = existingCount + newCount;

    if (totalCount > maxAllowed) {
      const excessCount = totalCount - maxAllowed;
      return {
        valid: false,
        message: `You already have ${existingCount} image${existingCount !== 1 ? 's' : ''}. Adding ${newCount} new image${newCount !== 1 ? 's' : ''} would exceed the ${maxAllowed}-image limit by ${excessCount}. Please remove some images or upload fewer.`,
        currentCount: totalCount,
        maxAllowed,
        canAdd: Math.max(0, maxAllowed - existingCount),
      };
    }

    // Approaching limit warning for edit
    if (totalCount >= maxAllowed - 1) {
      return {
        valid: true,
        message: `You have ${totalCount}/${maxAllowed} slots used.`,
        currentCount: totalCount,
        maxAllowed,
        canAdd: Math.max(0, maxAllowed - existingCount),
      };
    }

    return {
      valid: true,
      currentCount: totalCount,
      maxAllowed,
      canAdd: Math.max(0, maxAllowed - existingCount),
    };
  }

  /**
   * Check if uploading more images would exceed the limit
   */
  canAddMoreImages(
    existingCount: number,
    maxAllowed: number
  ): boolean {
    return existingCount < maxAllowed;
  }

  /**
   * Calculate remaining slots
   */
  getRemainingSlots(
    newImages: File[],
    existingImages: string[],
    maxAllowed: number
  ): number {
    const totalCount = existingImages.length + newImages.length;
    return Math.max(0, maxAllowed - totalCount);
  }

  /**
   * Check if at maximum capacity
   */
  isAtMaxCapacity(
    existingCount: number,
    maxAllowed: number
  ): boolean {
    return existingCount >= maxAllowed;
  }

  /**
   * Check if approaching limit (80% or more filled)
   */
  isApproachingLimit(
    currentCount: number,
    maxAllowed: number,
    threshold: number = 0.8
  ): boolean {
    return currentCount / maxAllowed >= threshold;
  }

  /**
   * Get the limit for a specific entity type
   */
  getLimit(entityType: keyof ImageUploadLimits): number {
    return this.LIMITS[entityType];
  }

  /**
   * Get all configured limits
   */
  getLimits(): ImageUploadLimits {
    return { ...this.LIMITS };
  }

  /**
   * Generate a user-friendly message for image count display
   */
  getCountDisplayMessage(
    currentCount: number,
    maxAllowed: number,
    label: string = 'Images'
  ): string {
    return `${label}: ${currentCount}/${maxAllowed}`;
  }

  /**
   * Check if a warning should be displayed
   */
  shouldShowWarning(
    currentCount: number,
    maxAllowed: number
  ): boolean {
    return this.isApproachingLimit(currentCount, maxAllowed);
  }

  /**
   * Get warning message if applicable
   */
  getWarningMessage(
    currentCount: number,
    maxAllowed: number
  ): string | null {
    if (!this.shouldShowWarning(currentCount, maxAllowed)) {
      return null;
    }

    const remaining = maxAllowed - currentCount;
    if (remaining === 0) {
      return 'Maximum image limit reached. Remove some images to add more.';
    }

    return `You have ${remaining} slot${remaining !== 1 ? 's' : ''} left.`;
  }
}
