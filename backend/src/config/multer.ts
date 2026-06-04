import multer, { StorageEngine } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { env } from './env';

const uploadsBase = path.resolve(env.UPLOADS_PATH);

// Create all sub-directories at startup
const subDirs = ['profiles', 'resumes', 'certificates', 'videos'];
for (const dir of subDirs) {
  const full = path.join(uploadsBase, dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
}

function makeStorage(folder: string): StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(uploadsBase, folder));
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
      cb(new Error(`File type not allowed. Allowed types: ${allowed.join(', ')}`));
    }
  };
}

const MB = 1024 * 1024;

export const uploadProfile = multer({
  storage: makeStorage('profiles'),
  fileFilter: mimeFilter(['image/jpeg', 'image/png', 'image/webp']),
  limits: { fileSize: 5 * MB },
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
export const uploadImages = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsBase);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, uuidv4() + ext);
    },
  }),
  fileFilter: mimeFilter([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ]),
  limits: { fileSize: 5 * MB },
});
