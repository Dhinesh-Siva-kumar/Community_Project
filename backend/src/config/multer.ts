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
