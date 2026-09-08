/**
 * Standardized upload and loading state constants
 * Ensures consistent naming across all components for loading, creating, updating, and uploading states
 */

export const LOADING_STATE_NAMES = {
  CREATE: 'isCreating',
  UPDATE: 'isUpdating',
  UPLOADING: 'isUploading',
  SAVING: 'isSaving',
} as const;

/**
 * Single source of truth for upload limits — the templates bind to these
 * rather than repeating literals.
 *
 * Users are not asked to shrink their own photos: anything over
 * COMPRESS_TARGET_MB is resized and re-encoded in the browser before it is
 * sent (see ImageCompressionService), and the backend repeats the same step
 * with Sharp as the authoritative guarantee. MAX_FILE_SIZE_MB is therefore
 * only the point at which a file is genuinely refused, and must stay in step
 * with the backend's IMAGE_MAX_UPLOAD_BYTES.
 */
export const UPLOAD_CONFIG = {
  /** Hard refusal threshold — the source file is too big to even process. */
  MAX_FILE_SIZE_MB: 25,
  /** Anything above this is compressed down before upload. */
  COMPRESS_TARGET_MB: 2,
  /** Long-edge cap applied while compressing. */
  MAX_DIMENSION: 2048,
  /** Starting JPEG/WebP quality; lowered stepwise if the target is missed. */
  COMPRESS_QUALITY: 0.8,
  MAX_IMAGES: 10,
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
} as const;

export const FORM_DATA_FIELD_NAMES = {
  IMAGES: 'images',
  IMAGE: 'image',
  LOGO: 'logo',
  AVATAR: 'avatar',
  FILE: 'file',
} as const;
