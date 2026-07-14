import { Injectable } from '@angular/core';

/**
 * Result of duplicate detection operation
 */
export interface DuplicateDetectionResult {
  /** Indices of files that are duplicates */
  duplicates: Set<number>;
  /** Hash strings for all files (including duplicates) */
  hashes: string[];
  /** Whether any duplicates were found */
  hasDuplicates: boolean;
}

/**
 * Detailed duplicate information
 */
export interface DuplicateInfo {
  /** Index of the duplicate file */
  currentIndex: number;
  /** Index of the existing file it matches */
  existingIndex: number;
  /** Hash value */
  hash: string;
}

/**
 * Service for detecting duplicate images using SHA-256 hashing
 * Uses Web Crypto API for fast, non-blocking hashing (no external dependencies)
 *
 * Performance:
 * - Single 1MB image: ~5-10ms
 * - Single 5MB image: ~25-50ms
 * - Batch of 10 images (5MB each): ~250-500ms
 */
@Injectable({
  providedIn: 'root',
})
export class ImageDuplicateDetectorService {
  /**
   * Converts ArrayBuffer to hexadecimal string
   * @param buffer The ArrayBuffer from crypto.subtle.digest
   * @returns Hex string representation of the hash
   */
  private bufferToHex(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < view.length; i++) {
      const byte = view[i].toString(16);
      hex += byte.length === 1 ? '0' + byte : byte;
    }
    return hex;
  }

  /**
   * Compute SHA-256 hash for a single file
   * Uses Web Crypto API for browser-native hashing
   *
   * @param file The File to hash
   * @returns Promise<string> The hex-encoded SHA-256 hash
   */
  async computeFileHash(file: File): Promise<string> {
    try {
      // Read file as ArrayBuffer
      const buffer = await file.arrayBuffer();
      // Compute SHA-256 hash using Web Crypto API
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      // Convert to hex string
      return this.bufferToHex(hashBuffer);
    } catch (error) {
      console.error(`Error hashing file ${file.name}:`, error);
      throw new Error(`Failed to compute hash for ${file.name}`);
    }
  }

  /**
   * Detect duplicate images within a set of files and optionally against existing hashes
   *
   * @param files Array of File objects to check
   * @param existingHashes Optional array of existing hash strings (e.g., from database)
   * @returns Promise<DuplicateDetectionResult> Result containing duplicate indices and all hashes
   */
  async detectDuplicates(
    files: File[],
    existingHashes: string[] = []
  ): Promise<DuplicateDetectionResult> {
    // Compute hashes for all new files
    const hashes: string[] = [];
    const duplicateSet = new Set<number>();

    try {
      // Hash all new files
      for (let i = 0; i < files.length; i++) {
        const hash = await this.computeFileHash(files[i]);
        hashes.push(hash);

        // Check against existing hashes (from database/previous uploads)
        if (existingHashes.includes(hash)) {
          duplicateSet.add(i);
        }

        // Check against previously computed hashes (within current batch)
        // This catches duplicates within the newly selected files
        for (let j = 0; j < i; j++) {
          if (hashes[j] === hash) {
            duplicateSet.add(i);
            // Note: We don't add j because it's the first occurrence
            break;
          }
        }
      }

      return {
        duplicates: duplicateSet,
        hashes,
        hasDuplicates: duplicateSet.size > 0,
      };
    } catch (error) {
      console.error('Error during duplicate detection:', error);
      throw error;
    }
  }

  /**
   * Get detailed information about duplicates
   *
   * @param files Array of File objects
   * @param existingHashes Optional array of existing hash strings
   * @returns Promise<DuplicateInfo[]> Array of duplicate information
   */
  async getDuplicateDetails(
    files: File[],
    existingHashes: string[] = []
  ): Promise<DuplicateInfo[]> {
    const result = await this.detectDuplicates(files, existingHashes);
    const duplicateDetails: DuplicateInfo[] = [];

    // Find all duplicates with their original indices
    for (const dupIndex of result.duplicates) {
      const dupHash = result.hashes[dupIndex];

      // Find the original (first occurrence)
      for (let i = 0; i < dupIndex; i++) {
        if (result.hashes[i] === dupHash) {
          duplicateDetails.push({
            currentIndex: dupIndex,
            existingIndex: i,
            hash: dupHash,
          });
          break;
        }
      }

      // Or check if it matches an existing hash
      if (existingHashes.includes(dupHash)) {
        duplicateDetails.push({
          currentIndex: dupIndex,
          existingIndex: -1, // -1 indicates it's a pre-existing hash
          hash: dupHash,
        });
      }
    }

    return duplicateDetails;
  }

  /**
   * Generate a user-friendly message about duplicate images
   *
   * @param duplicateDetails Array of duplicate information
   * @param files Array of File objects (for reference)
   * @returns String describing the duplicates found
   */
  generateDuplicateMessage(
    duplicateDetails: DuplicateInfo[],
    files: File[]
  ): string {
    if (duplicateDetails.length === 0) {
      return '';
    }

    if (duplicateDetails.length === 1) {
      const dup = duplicateDetails[0];
      if (dup.existingIndex === -1) {
        return `⚠️ Image "${files[dup.currentIndex].name}" is identical to a previously uploaded image.`;
      } else {
        return `⚠️ Image #${dup.currentIndex + 1} ("${files[dup.currentIndex].name}") is identical to Image #${
          dup.existingIndex + 1
        } ("${files[dup.existingIndex].name}").`;
      }
    }

    // Multiple duplicates
    const duplicateNumbers = duplicateDetails
      .map(d => `#${d.currentIndex + 1}`)
      .join(', ');
    return `⚠️ ${duplicateDetails.length} duplicate image(s) detected (${duplicateNumbers}). Remove or replace them?`;
  }

  /**
   * Filter out duplicate files from an array
   *
   * @param files Array of File objects
   * @param duplicateIndices Set of indices that are duplicates
   * @returns Array of unique File objects
   */
  filterUniqueFiles(
    files: File[],
    duplicateIndices: Set<number>
  ): File[] {
    return files.filter((_, index) => !duplicateIndices.has(index));
  }

  /**
   * Compare two files for equality (by hash)
   *
   * @param file1 First file
   * @param file2 Second file
   * @returns Promise<boolean> True if files have identical content
   */
  async filesAreIdentical(file1: File, file2: File): Promise<boolean> {
    const hash1 = await this.computeFileHash(file1);
    const hash2 = await this.computeFileHash(file2);
    return hash1 === hash2;
  }
}
