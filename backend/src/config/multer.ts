import multer, { StorageEngine } from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { UPLOADS_BASE, ensureUploadDirs } from '../services/upload-storage.service';
import { env } from './env';
import { AppError } from '../middleware/errorHandler';

ensureUploadDirs();

function makeStorage(folder: string): StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(UPLOADS_BASE, folder));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, uuidv4() + ext);
    },
  });
}

function mimeFilter(allowed: string[]) {
  return (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // AppError (not a bare Error) so errorHandler answers 400 with a
      // translatable code instead of letting it fall through to a 500.
      cb(
        new AppError(
          400,
          `File type not allowed. Allowed types: ${allowed.join(', ')}`,
          'UPLOAD_INVALID_TYPE',
        ),
      );
    }
  };
}

/**
 * Video formats accepted on a post. QuickTime (.mov, what iPhones record) is
 * deliberately excluded: Chrome and Android frequently cannot play it, and
 * with no ffmpeg available there is no way to transcode it server-side, so
 * accepting it would mean posts that show a blank player to part of the
 * community. The frontend surfaces this as a named error.
 */
export const POST_VIDEO_MIMETYPES = ['video/mp4', 'video/webm'];

/**
 * Per-field mime allowlist, for uploaders whose fields carry different kinds
 * of media. An unknown field name is rejected outright rather than silently
 * accepted.
 */
function fieldMimeFilter(allowedByField: Record<string, string[]>) {
  return (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const allowed = allowedByField[file.fieldname];
    if (allowed && allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          400,
          allowed
            ? `File type not allowed for ${file.fieldname}. Allowed types: ${allowed.join(', ')}`
            : `Unexpected upload field: ${file.fieldname}`,
          'UPLOAD_INVALID_TYPE',
        ),
      );
    }
  };
}

/**
 * Multer binds ONE storage engine per instance, but post media needs two:
 * images must stay in memory so Sharp can validate and compress the buffer,
 * while a 100MB video should stream straight to disk instead of being held
 * in RAM for the length of the upload. This delegates by field name.
 */
function fieldRoutedStorage(
  byField: Record<string, StorageEngine>,
  fallback: StorageEngine,
): StorageEngine {
  return {
    _handleFile(req, file, cb) {
      (byField[file.fieldname] ?? fallback)._handleFile(req, file, cb);
    },
    _removeFile(req, file, cb) {
      (byField[file.fieldname] ?? fallback)._removeFile(req, file, cb);
    },
  };
}

const MB = 1024 * 1024;

// Memory storage — the controller validates the buffer with Sharp (via
// FileValidationService) before writing it to disk itself with
// saveBufferToFile(), same as the business/events/jobs/upload endpoints.
//
// fileSize is deliberately generous: saveBufferToFile() downscales and
// re-encodes anything over env.IMAGE_TARGET_BYTES, so this is the ceiling
// on what we will parse, not on what we will store.
export const uploadProfile = multer({
  storage: multer.memoryStorage(),
  fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/webp']),
  limits: { fileSize: env.IMAGE_MAX_UPLOAD_BYTES, files: 1 },
});

export const uploadResume = multer({
  storage: makeStorage('resumes'),
  fileFilter: mimeFilter([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  limits: { fileSize: 10 * MB },
});

export const uploadCertificate = multer({
  storage: makeStorage('certificates'),
  fileFilter: mimeFilter(['application/pdf', 'image/jpeg', 'image/png']),
  limits: { fileSize: 10 * MB },
});

export const uploadVideo = multer({
  storage: makeStorage('videos'),
  fileFilter: mimeFilter(['video/mp4', 'video/webm', 'video/quicktime']),
  limits: { fileSize: 200 * MB },
});

// Businesses carry three separate galleries (gallery photos, menu cards,
// business cards) of up to ten images each, plus a logo — 31 parts, well
// past the `files: 11` ceiling on the shared uploadImages below. Kept as its
// own instance so events/jobs/upload keep their tighter bound.
//
// PDF is deliberately absent from the allowlist even though uploadImages
// permits it: the controller validates every part with Sharp, so a PDF would
// be accepted here only to fail later with a confusing "image validation
// failed". Supporting PDF menu cards needs a non-Sharp validation path.
export const uploadBusinessMedia = multer({
  storage: multer.memoryStorage(),
  fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  limits: { fileSize: env.IMAGE_MAX_UPLOAD_BYTES, files: 31 },
});

// Generic image + PDF uploader used by business/events/jobs/upload endpoints
// Uses memory storage so buffer is available for validation with Sharp.
// `files` caps the whole request: the widest route (business/jobs) sends one
// `logo` plus up to ten `images`. Routes still pass their own maxCount, but
// that is per-field — this is what bounds a single multipart request now that
// each part may be IMAGE_MAX_UPLOAD_BYTES.
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  fileFilter: mimeFilter([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ]),
  limits: { fileSize: env.IMAGE_MAX_UPLOAD_BYTES, files: 11 },
});

/**
 * Community post media: EITHER up to ten images OR one video, never both
 * (the DTO and controller enforce the exclusivity; multer only parses).
 *
 * fileSize is per-file and has to be the larger of the two limits, so it
 * cannot express the tighter image cap — posts.controller re-checks each
 * `images` part against env.IMAGE_MAX_UPLOAD_BYTES.
 */
export const uploadPostMedia = multer({
  storage: fieldRoutedStorage({ video: makeStorage('videos') }, multer.memoryStorage()),
  fileFilter: fieldMimeFilter({
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: POST_VIDEO_MIMETYPES,
  }),
  limits: { fileSize: env.VIDEO_MAX_UPLOAD_BYTES, files: 11 },
});
