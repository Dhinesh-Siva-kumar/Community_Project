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

/**
 * Post videos. There is no compression fallback the way there is for images
 * — a video that breaks either limit is refused outright — so these are hard
 * caps, and MAX_FILE_SIZE_MB must stay in step with the backend's
 * VIDEO_MAX_UPLOAD_BYTES.
 *
 * QuickTime (.mov) is absent on purpose: iPhone-recorded .mov often will not
 * play in Chrome or on Android, and the server cannot transcode it.
 */
export const VIDEO_CONFIG = {
  MAX_FILE_SIZE_MB: 100,
  MAX_DURATION_SECONDS: 120,
  SUPPORTED_FORMATS: ['video/mp4', 'video/webm'],
} as const;

export const FORM_DATA_FIELD_NAMES = {
  /** Business "Gallery Photos", and the generic image field elsewhere. */
  IMAGES: 'images',
  /** Business "Menu Card Images". */
  MENU_IMAGES: 'menuImages',
  /** Business "Business Card Images". */
  CARD_IMAGES: 'cardImages',
  IMAGE: 'image',
  LOGO: 'logo',
  AVATAR: 'avatar',
  FILE: 'file',
  VIDEO: 'video',
} as const;
