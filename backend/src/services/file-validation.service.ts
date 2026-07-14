import sharp, { Metadata } from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Image validation constraints
 */
const IMAGE_CONSTRAINTS = {
  JPEG: { minWidth: 100, maxWidth: 10000, minHeight: 100, maxHeight: 10000 },
  PNG: { minWidth: 100, maxWidth: 10000, minHeight: 100, maxHeight: 10000 },
  WebP: { minWidth: 100, maxWidth: 10000, minHeight: 100, maxHeight: 10000 },
  GIF: { minWidth: 100, maxWidth: 10000, minHeight: 100, maxHeight: 10000 },
};

/**
 * Allowed image MIME types and their sharp format names
 */
const ALLOWED_MIMETYPES: Record<string, keyof typeof IMAGE_CONSTRAINTS> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
};

interface ValidationResult {
  valid: boolean;
  error?: string;
  metadata?: Metadata;
}

/**
 * File Validation Service
 * Performs server-side validation of uploaded images using Sharp library
 * - Detects actual image format vs. claimed MIME type
 * - Validates image dimensions
 * - Removes EXIF data for security
 * - Supports: JPEG, PNG, WebP, GIF
 */
export class FileValidationService {
  /**
   * Validates an image buffer against claimed MIME type
   * Returns true if valid, false otherwise
   *
   * @param fileBuffer - The file buffer to validate
   * @param claimedMimetype - The MIME type claimed by the client
   * @returns ValidationResult with validity status and optional error message
   */
  static async validateImage(
    fileBuffer: Buffer,
    claimedMimetype: string,
  ): Promise<ValidationResult> {
    try {
      // Check if MIME type is allowed
      if (!ALLOWED_MIMETYPES[claimedMimetype]) {
        return {
          valid: false,
          error: `MIME type not allowed. Allowed types: ${Object.keys(ALLOWED_MIMETYPES).join(', ')}`,
        };
      }

      // Get metadata from buffer to detect actual format
      const metadata = await sharp(fileBuffer).metadata();

      // Verify that the actual format matches the claimed format
      const actualFormat = metadata.format?.toUpperCase();
      const expectedFormat = ALLOWED_MIMETYPES[claimedMimetype];

      if (actualFormat !== expectedFormat) {
        return {
          valid: false,
          error: `File format mismatch. Claimed: ${claimedMimetype}, Actual: ${actualFormat}. This may indicate a disguised file.`,
          metadata,
        };
      }

      // Get dimension constraints for this format
      const constraints = IMAGE_CONSTRAINTS[expectedFormat];

      // Check image dimensions
      if (!metadata.width || !metadata.height) {
        return {
          valid: false,
          error: 'Unable to determine image dimensions',
          metadata,
        };
      }

      if (metadata.width < constraints.minWidth || metadata.width > constraints.maxWidth) {
        return {
          valid: false,
          error: `Image width must be between ${constraints.minWidth}px and ${constraints.maxWidth}px. Got ${metadata.width}px`,
          metadata,
        };
      }

       if (metadata.height < constraints.minHeight || metadata.height > constraints.maxHeight) {
         return {
           valid: false,
           error: `Image height must be between ${constraints.minHeight}px and ${constraints.maxHeight}px. Got ${metadata.height}px`,
           metadata,
         };
       }

       // All validation passed
       // (Color space check removed as it's optional in metadata and not a security issue)
       return {
         valid: true,
         metadata,
       };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        error: `Image validation failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Removes EXIF and other metadata from image for security
   * Writes the cleaned image back to the file system
   *
   * @param filePath - Full path to the image file
   * @returns Promise<boolean> - true if successful, false otherwise
   */
  static async removeMetadata(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return false;
      }

      // Read file
      const buffer = fs.readFileSync(filePath);

      // Process through sharp to remove metadata
      // Sharp automatically strips EXIF, XMP, and IPTC data
      const processedBuffer = await sharp(buffer)
        .rotate() // rotate() removes EXIF orientation
        .toBuffer();

      // Write back to file
      fs.writeFileSync(filePath, processedBuffer);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to remove metadata from ${filePath}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Validates a single file with proper error handling
   * Suitable for middleware or route handlers
   *
   * @param file - Express Multer file object
   * @returns ValidationResult with detailed error information
   */
  static async validateMulterFile(file: Express.Multer.File | undefined): Promise<ValidationResult> {
    if (!file) {
      return {
        valid: false,
        error: 'No file provided',
      };
    }

    if (!file.buffer) {
      return {
        valid: false,
        error: 'File buffer not available',
      };
    }

    return this.validateImage(file.buffer, file.mimetype);
  }

  /**
   * Validates an array of files
   *
   * @param files - Array of Express Multer file objects
   * @returns Promise<{ valid: boolean; invalidFiles: string[] }>
   */
  static async validateMulterFiles(
    files: Express.Multer.File[] | undefined,
  ): Promise<{ valid: boolean; invalidFiles: { filename: string; error: string }[] }> {
    if (!files || files.length === 0) {
      return { valid: true, invalidFiles: [] };
    }

    const invalidFiles: { filename: string; error: string }[] = [];

    for (const file of files) {
      const result = await this.validateMulterFile(file);
      if (!result.valid) {
        invalidFiles.push({
          filename: file.originalname,
          error: result.error || 'Unknown validation error',
        });
      }
    }

    return {
      valid: invalidFiles.length === 0,
      invalidFiles,
    };
  }
}
