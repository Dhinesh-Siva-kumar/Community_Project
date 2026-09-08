import * as fs from 'fs';
import sharp, { Sharp } from 'sharp';
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
 * Formats Sharp can usefully re-encode. GIF is deliberately absent:
 * re-encoding one through Sharp flattens it to a single frame, so animated
 * GIFs are written through untouched.
 */
const COMPRESSIBLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

const EXTENSION_FOR_FORMAT: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
};

interface EncodeAttempt {
  /** Output format, so the stored filename can carry a truthful extension. */
  format: string;
  apply: (pipeline: Sharp) => Sharp;
}

const jpegAttempt = (quality: number): EncodeAttempt => ({
  format: 'jpeg',
  apply: (p) => p.jpeg({ quality, mozjpeg: true }),
});

/**
 * Re-encode attempts, tried in order until one fits IMAGE_TARGET_BYTES.
 *
 * PNG is the awkward one. It starts lossless, since a screenshot or a flat
 * logo usually fits on compression alone. When that is not enough the route
 * depends on transparency: an opaque PNG is almost always a photo saved in
 * the wrong format, so it becomes a JPEG (which also renames the stored
 * file); one with an alpha channel has to stay PNG, and degrades through
 * palette quantisation instead.
 */
function encodeAttempts(format: string, hasAlpha: boolean): EncodeAttempt[] {
  switch (format) {
    case 'png':
      return [
        { format: 'png', apply: (p) => p.png({ compressionLevel: 9 }) },
        ...(hasAlpha
          ? [80, 60].map((quality) => ({
              format: 'png',
              apply: (p: Sharp) => p.png({ compressionLevel: 9, palette: true, quality }),
            }))
          : [82, 70, 60].map(jpegAttempt)),
      ];
    case 'webp':
      return [82, 70, 60].map((quality) => ({
        format: 'webp',
        apply: (p: Sharp) => p.webp({ quality }),
      }));
    default:
      return [82, 70, 60].map(jpegAttempt);
  }
}

interface CompressedImage {
  buffer: Buffer;
  /** Set only when the re-encode changed format, e.g. an opaque PNG to JPEG. */
  extension?: string;
}

/**
 * Brings an image within IMAGE_TARGET_BYTES / IMAGE_MAX_DIMENSION by
 * downscaling and re-encoding it, so a 20MB phone photo gets stored as a
 * ~1MB one instead of being rejected at the edge.
 *
 * Format is preserved wherever it can be — that keeps PNG/WebP alpha intact
 * for logos. When it genuinely cannot be (an opaque PNG too heavy to store
 * as one), the new extension comes back with the buffer so the caller can
 * name the file honestly rather than writing JPEG bytes into a `.png`.
 *
 * Never throws: callers have already validated the image, so a compression
 * failure must degrade to storing the original rather than losing an upload.
 */
async function compressImageBuffer(buffer: Buffer): Promise<CompressedImage> {
  try {
    const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
    const format = metadata.format;
    if (!format || !COMPRESSIBLE_FORMATS.has(format)) return { buffer };

    const longEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    const overWeight = buffer.byteLength > env.IMAGE_TARGET_BYTES;
    const overSized = longEdge > env.IMAGE_MAX_DIMENSION;
    if (!overWeight && !overSized) return { buffer };

    let best: CompressedImage | null = null;

    for (const attempt of encodeAttempts(format, Boolean(metadata.hasAlpha))) {
      // A fresh pipeline per attempt — output options accumulate on a Sharp
      // instance, so reusing one across attempts would blend them.
      const pipeline = sharp(buffer, { failOn: 'none' })
        // rotate() with no argument bakes in EXIF orientation (phone photos
        // land sideways otherwise) and drops EXIF/XMP/IPTC with it.
        .rotate()
        .resize({
          width: env.IMAGE_MAX_DIMENSION,
          height: env.IMAGE_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        });

      const candidate = await attempt.apply(pipeline).toBuffer();
      if (!best || candidate.byteLength < best.buffer.byteLength) {
        best = {
          buffer: candidate,
          ...(attempt.format === format ? {} : { extension: EXTENSION_FOR_FORMAT[attempt.format] }),
        };
      }
      if (candidate.byteLength <= env.IMAGE_TARGET_BYTES) break;
    }

    // Re-encoding can enlarge an already well-optimised file; keep the smaller.
    return best && best.buffer.byteLength < buffer.byteLength ? best : { buffer };
  } catch {
    return { buffer };
  }
}

/**
 * Writes a buffer (e.g. from multer's memoryStorage, after Sharp-based
 * validation) to disk under a generated uuid filename, optionally inside a
 * named subfolder. Returns the filename (prefixed with `folder/` when one is
 * given) — callers build the `/uploads/...` path prefix themselves since it
 * varies slightly per call site (images array, logo, companyLogo, etc.).
 *
 * This is the single choke point every image upload passes through, so the
 * size normalisation lives here: multer accepts up to IMAGE_MAX_UPLOAD_BYTES
 * and compressImageBuffer() brings whatever arrives down to
 * IMAGE_TARGET_BYTES before it ever reaches disk. Non-image uploads
 * (resumes, certificates, videos) use multer's diskStorage and never reach
 * this function, so they are unaffected.
 */
export async function saveBufferToFile(buffer: Buffer, originalName: string, folder?: string): Promise<string> {
  const targetDir = folder ? path.join(UPLOADS_BASE, folder) : UPLOADS_BASE;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const compressed = await compressImageBuffer(buffer);
  // compressImageBuffer only reports an extension when it had to change
  // format, so the stored name always matches the stored bytes.
  const ext = compressed.extension ?? path.extname(originalName);
  const filename = uuidv4() + ext;

  await fs.promises.writeFile(path.join(targetDir, filename), compressed.buffer);
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
