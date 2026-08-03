import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

/**
 * Single source of truth for the upload storage location.
 *
 * `path.resolve()` returns an absolute input unchanged, so pointing
 * UPLOADS_PATH at an absolute, persistent path (e.g. a mounted volume on a
 * host) "just works" — this constant is computed once so every consumer
 * (multer's diskStorage, the manual buffer-write helper below, and the
 * `/uploads` static file server) always agrees on the same directory.
 */
export const UPLOADS_BASE = path.resolve(env.UPLOADS_PATH);

export const UPLOAD_SUBDIRS = [
  'profiles',
  'resumes',
  'certificates',
  'videos',
  'communities',
  'posts',
  'business',
  'events',
  'jobs',
] as const;

// Folder names a client may request via the generic /api/upload endpoint's
// `folder` field. Anything else is rejected — prevents path traversal /
// writing outside the uploads root via an arbitrary folder value.
export const ALLOWED_UPLOAD_FOLDERS = ['communities'] as const;
export type AllowedUploadFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number];

export function isAllowedUploadFolder(value: unknown): value is AllowedUploadFolder {
  return typeof value === 'string' && (ALLOWED_UPLOAD_FOLDERS as readonly string[]).includes(value);
}

/**
 * Creates the uploads root and each named subdirectory (with a .gitkeep
 * placeholder) if they don't already exist. Safe to call more than once —
 * every check is existence-guarded.
 */
export function ensureUploadDirs(): void {
  for (const dir of UPLOAD_SUBDIRS) {
    const full = path.join(UPLOADS_BASE, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
    const keep = path.join(full, '.gitkeep');
    if (!fs.existsSync(keep)) {
      fs.writeFileSync(keep, '');
    }
  }
}

/**
 * Writes a buffer (e.g. from multer's memoryStorage, after Sharp-based
 * validation) to disk under a generated uuid filename, optionally inside a
 * named subfolder. Returns the filename (prefixed with `folder/` when one is
 * given) — callers build the `/uploads/...` path prefix themselves since it
 * varies slightly per call site (images array, logo, companyLogo, etc.).
 */
export async function saveBufferToFile(buffer: Buffer, originalName: string, folder?: string): Promise<string> {
  const ext = path.extname(originalName);
  const filename = uuidv4() + ext;
  const targetDir = folder ? path.join(UPLOADS_BASE, folder) : UPLOADS_BASE;
  const filePath = path.join(targetDir, filename);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(filePath, buffer);
  return folder ? `${folder}/${filename}` : filename;
}

/**
 * Best-effort delete of a previously-saved upload, given its stored
 * `/uploads/...` path (as returned to and persisted from the client, e.g.
 * `/uploads/posts/<uuid>.jpg` or a legacy flat `/uploads/<uuid>.jpg`).
 * Resolves the path against UPLOADS_BASE and refuses to touch anything
 * outside it, so a malformed or malicious stored value can't ever delete
 * files elsewhere on disk. Missing files and FS errors are swallowed since
 * this always runs after the DB row has already been updated/deleted.
 */
export function deleteUploadedFile(storedPath: unknown): void {
  if (typeof storedPath !== 'string' || !storedPath.startsWith('/uploads/')) return;

  const relative = storedPath.slice('/uploads/'.length);
  const normalized = path.normalize(relative);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return;

  const filePath = path.join(UPLOADS_BASE, normalized);
  if (!filePath.startsWith(UPLOADS_BASE)) return;

  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup — ignore and move on
  }
}

export function deleteUploadedFiles(storedPaths: unknown): void {
  if (!Array.isArray(storedPaths)) return;
  storedPaths.forEach(deleteUploadedFile);
}
