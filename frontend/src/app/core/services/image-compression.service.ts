import { Injectable } from '@angular/core';

/**
 * Service for compressing images using Canvas API
 * Reduces bandwidth consumption and improves mobile performance
 */
@Injectable({
  providedIn: 'root'
})
export class ImageCompressionService {
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
    quality: number = 0.8,
    maxWidth: number = 2048,
    maxHeight: number = 2048
  ): Promise<File> {
    // Validate inputs
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Invalid file: must be an image');
    }

    const validQuality = Math.max(0.5, Math.min(1.0, quality)); // Clamp between 0.5-1.0
    
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
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: file.lastModified,
                  });

                  resolve(compressedFile);
                },
                'image/jpeg',
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
