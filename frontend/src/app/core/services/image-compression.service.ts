import { Injectable } from '@angular/core';
import { UPLOAD_CONFIG } from '../constants/upload.constants';

/**
 * Formats a canvas can actually encode. Anything else (HEIC, BMP, TIFF...)
 * still decodes via an <img> element, so it is re-encoded as JPEG on the way out.
 */
const ENCODABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Quality ladder, tried in order until the result fits the target. */
const QUALITY_STEPS = [UPLOAD_CONFIG.COMPRESS_QUALITY, 0.7, 0.6];

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Compresses images with the Canvas API before they are uploaded, so a 20MB
 * phone photo leaves the browser as a few hundred KB instead of being pushed
 * over a mobile connection in full.
 *
 * The backend repeats this step with Sharp and is the authoritative limit —
 * this layer exists for upload speed, not for enforcement, and is free to
 * give up and hand back the original file.
 */
@Injectable({
  providedIn: 'root'
})
export class ImageCompressionService {
  /**
   * Compresses a file just enough to fit targetBytes, stepping the quality
   * down until it does. Returns the original file untouched when it already
   * fits, when it is not a compressible image, or when anything goes wrong.
   */
  async compressToTarget(
    file: File,
    targetBytes: number = UPLOAD_CONFIG.COMPRESS_TARGET_MB * 1024 * 1024,
    maxDimension: number = UPLOAD_CONFIG.MAX_DIMENSION
  ): Promise<File> {
    if (!file.type.startsWith('image/')) return file;
    // Animated GIFs lose every frame but the first on a canvas round-trip.
    if (file.type === 'image/gif') return file;

    try {
      // PNG ignores the quality argument (it is lossless), so extra passes
      // would produce byte-identical results — resize once and stop.
      const steps = this.outputType(file) === 'image/png' ? [QUALITY_STEPS[0]] : QUALITY_STEPS;
      let best: File | null = null;

      for (const quality of steps) {
        const candidate = await this.compressImage(file, quality, maxDimension, maxDimension);
        if (!best || candidate.size < best.size) best = candidate;
        if (candidate.size <= targetBytes) break;
      }

      // Re-encoding can inflate an already well-optimised file.
      return best && best.size < file.size ? best : file;
    } catch {
      return file;
    }
  }

  /**
   * Compress an image file using Canvas API
   * @param file The image file to compress
   * @param quality Compression quality (0.5-1.0), default 0.8 (80%)
   * @param maxWidth Maximum width in pixels, default 2048
   * @param maxHeight Maximum height in pixels, default 2048
   * @returns Compressed image as File object
   */
  async compressImage(
    file: File,
    quality: number = UPLOAD_CONFIG.COMPRESS_QUALITY,
    maxWidth: number = UPLOAD_CONFIG.MAX_DIMENSION,
    maxHeight: number = UPLOAD_CONFIG.MAX_DIMENSION
  ): Promise<File> {
    // Validate inputs
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Invalid file: must be an image');
    }

    const validQuality = Math.max(0.5, Math.min(1.0, quality)); // Clamp between 0.5-1.0
    const outputType = this.outputType(file);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              // Calculate new dimensions while maintaining aspect ratio
              let { width, height } = this.calculateDimensions(
                img.width,
                img.height,
                maxWidth,
                maxHeight
              );

              // Create canvas and draw resized image
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;

              const ctx = canvas.getContext('2d');
              if (!ctx) {
                throw new Error('Failed to get canvas context');
              }

              ctx.drawImage(img, 0, 0, width, height);

              // Convert canvas to blob with compression
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    reject(new Error('Failed to compress image'));
                    return;
                  }

                  // Create new File object from compressed blob
                  const compressedFile = new File([blob], this.outputName(file, outputType), {
                    type: outputType,
                    lastModified: file.lastModified,
                  });

                  resolve(compressedFile);
                },
                outputType,
                validQuality
              );
            } catch (error) {
              reject(error);
            }
          };

          img.onerror = () => {
            reject(new Error('Failed to load image'));
          };

          img.src = event.target?.result as string;
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Format to re-encode into. PNG and WebP are kept as-is so logos keep their
   * transparency — flattening those onto a canvas and saving as JPEG turns
   * every transparent pixel black. An opaque PNG that is really a photo is
   * left for the backend to convert, since Sharp can inspect the alpha
   * channel far more cheaply than scanning pixels here.
   */
  private outputType(file: File): string {
    return ENCODABLE_TYPES.has(file.type) ? file.type : 'image/jpeg';
  }

  /**
   * Keeps the filename in step with the bytes. The backend derives the stored
   * file's extension from this name, so a re-encoded HEIC must not still
   * claim to be a .heic.
   */
  private outputName(file: File, outputType: string): string {
    if (file.type === outputType) return file.name;
    const extension = EXTENSION_FOR_TYPE[outputType] ?? '.jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return base + extension;
  }

  /**
   * Calculate resized dimensions while maintaining aspect ratio
   * @param originalWidth Original image width
   * @param originalHeight Original image height
   * @param maxWidth Maximum width constraint
   * @param maxHeight Maximum height constraint
   * @returns New width and height dimensions
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    // If image is smaller than limits, don't resize
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }

    const ratio = originalWidth / originalHeight;

    let width = originalWidth;
    let height = originalHeight;

    if (width > maxWidth) {
      width = maxWidth;
      height = width / ratio;
    }

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  /**
   * Get human-readable file size
   * @param bytes File size in bytes
   * @returns Formatted size string (e.g., "1.5 MB")
   */
  getFileSizeString(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Calculate compression ratio
   * @param originalSize Original file size in bytes
   * @param compressedSize Compressed file size in bytes
   * @returns Compression ratio as percentage (e.g., "85%" means 85% reduction)
   */
  getCompressionRatio(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    return Math.round(((originalSize - compressedSize) / originalSize) * 100);
  }
}
