import { Request, Response, NextFunction } from 'express';
import { CreateBusinessDto, UpdateBusinessDto, CreateBusinessCategoryDto, UpdateBusinessCategoryDto, ListBusinessQueryDto, ListPendingBusinessQueryDto, RejectBusinessDto, RequestMoreInfoBusinessDto } from './business.dto';
import * as businessService from './business.service';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile } from '../../services/upload-storage.service';

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateBusinessCategoryDto.parse(req.body);
    const result = await businessService.createCategory(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.getCategories();
    res.json(result);
  } catch (err) { next(err); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = UpdateBusinessCategoryDto.parse(req.body);
    const result = await businessService.updateCategory(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.deleteCategory(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

/**
 * The three separate business galleries. Each has its own multipart file
 * field, its own DTO field, and (on update) its own kept-list of URLs the
 * user didn't remove — see the note in `update` below.
 */
const GALLERY_FIELDS = [
  { file: 'images', body: 'images', kept: 'existingImages' },
  { file: 'menuImages', body: 'menuImages', kept: 'existingMenuImages' },
  { file: 'cardImages', body: 'cardImages', kept: 'existingCardImages' },
] as const;

/** Sharp-validates a gallery's uploads, then writes them to disk. */
async function saveGalleryFiles(
  gallery: Express.Multer.File[],
): Promise<{ ok: true; paths: string[] } | { ok: false; errors: unknown }> {
  if (gallery.length === 0) return { ok: true, paths: [] };
  const validation = await FileValidationService.validateMulterFiles(gallery);
  if (!validation.valid) return { ok: false, errors: validation.invalidFiles };

  const filenames = await Promise.all(
    gallery.map((f) => saveBufferToFile(f.buffer, f.originalname, 'business'))
  );
  return { ok: true, paths: filenames.map((f) => `/uploads/${f}`) };
}

/** Validates and stores the optional logo, writing it onto `rawBody`. */
async function saveLogoFile(
  logoFiles: Express.Multer.File[],
  rawBody: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  if (logoFiles.length === 0) return { ok: true };
  const validation = await FileValidationService.validateMulterFile(logoFiles[0]);
  if (!validation.valid) return { ok: false, error: validation.error };

  const filename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname, 'business');
  rawBody['logo'] = `/uploads/${filename}`;
  return { ok: true };
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const rawBody = { ...req.body };

    for (const gallery of GALLERY_FIELDS) {
      const saved = await saveGalleryFiles(files[gallery.file] ?? []);
      if (!saved.ok) {
        res.status(400).json({ message: 'Image validation failed', errors: saved.errors });
        return;
      }
      if (saved.paths.length) rawBody[gallery.body] = saved.paths;
    }

    const logo = await saveLogoFile(files['logo'] ?? [], rawBody);
    if (!logo.ok) {
      res.status(400).json({ message: 'Logo validation failed', error: logo.error });
      return;
    }

    const body = CreateBusinessDto.parse(rawBody);
    const result = await businessService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListBusinessQueryDto.parse(req.query);
    const skipActiveFilter = req.user!.role === 'ADMIN';
    const result = await businessService.findAll({ ...query, skipActiveFilter, viewerId: req.user!.sub });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListBusinessQueryDto.parse(req.query);
    const result = await businessService.findAll({ ...query, userId: req.user!.sub, skipActiveFilter: true });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findPending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListPendingBusinessQueryDto.parse(req.query);
    const result = await businessService.findPendingOnly(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getPendingCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.countPending();
    res.json(result);
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.approve(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RejectBusinessDto.parse(req.body ?? {});
    const result = await businessService.reject(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function requestMoreInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RequestMoreInfoBusinessDto.parse(req.body ?? {});
    const result = await businessService.requestMoreInfo(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const rawBody = { ...req.body };

    // Each gallery's kept-list (e.g. `existingImages`, a JSON-stringified
    // string[] sent alongside the `images` file field) carries the URLs the
    // user chose to KEEP — i.e. didn't remove — on this edit. Without it,
    // uploading new photos would silently wipe out every existing one
    // instead of adding to them. It has to be a JSON *string* rather than a
    // repeated form field because an empty array would otherwise vanish
    // from the request entirely, which is indistinguishable from "not sent".
    //
    // Only rebuild a gallery when it was actually touched (a kept-list was
    // sent, or new files were uploaded); otherwise leave it out of the DTO
    // so the service's `!== undefined` check skips the column and the
    // existing gallery is left alone.
    for (const gallery of GALLERY_FIELDS) {
      const saved = await saveGalleryFiles(files[gallery.file] ?? []);
      if (!saved.ok) {
        res.status(400).json({ message: 'Image validation failed', errors: saved.errors });
        return;
      }

      const keptRaw = rawBody[gallery.kept];
      delete rawBody[gallery.kept];

      let kept: string[] = [];
      let keptProvided = false;
      if (typeof keptRaw === 'string') {
        keptProvided = true;
        try {
          const parsed = JSON.parse(keptRaw);
          if (Array.isArray(parsed)) kept = parsed.filter((v): v is string => typeof v === 'string');
        } catch { /* malformed — treat as no images kept */ }
      }

      if (keptProvided || saved.paths.length > 0) {
        rawBody[gallery.body] = [...kept, ...saved.paths];
      }
    }

    const logo = await saveLogoFile(files['logo'] ?? [], rawBody);
    if (!logo.ok) {
      res.status(400).json({ message: 'Logo validation failed', error: logo.error });
      return;
    }

    const body = UpdateBusinessDto.parse(rawBody);
    const result = await businessService.update(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.deleteBusiness(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
