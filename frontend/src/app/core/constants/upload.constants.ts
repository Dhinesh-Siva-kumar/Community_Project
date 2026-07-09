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

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE_MB: 5,
  MAX_IMAGES: 10,
  MAX_LOGO_SIZE_MB: 2,
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
} as const;

export const FORM_DATA_FIELD_NAMES = {
  IMAGES: 'images',
  IMAGE: 'image',
  LOGO: 'logo',
  AVATAR: 'avatar',
  FILE: 'file',
} as const;
