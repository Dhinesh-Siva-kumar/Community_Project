import { Request, Response, NextFunction } from 'express';
import { CreateBusinessDto, UpdateBusinessDto, CreateBusinessCategoryDto, UpdateBusinessCategoryDto, ListBusinessQueryDto } from './business.dto';
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

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const imageFiles = files['images'] ?? [];
    const logoFiles = files['logo'] ?? [];

    // Validate uploaded images
    const validation = await FileValidationService.validateMulterFiles(imageFiles);
    if (!validation.valid) {
      res.status(400).json({
        message: 'Image validation failed',
        errors: validation.invalidFiles,
      });
      return;
    }

    // Validate logo if present
    if (logoFiles.length > 0) {
      const logoValidation = await FileValidationService.validateMulterFile(logoFiles[0]);
      if (!logoValidation.valid) {
        res.status(400).json({
          message: 'Logo validation failed',
          error: logoValidation.error,
        });
        return;
      }
    }

    // Save validated files to disk
    const filenames = await Promise.all(
      imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname, 'business'))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;

    // Save logo if present
    if (logoFiles.length > 0) {
      const logoFilename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname, 'business');
      rawBody['logo'] = `/uploads/${logoFilename}`;
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
    const result = await businessService.findAll({ ...query, skipActiveFilter });
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

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const imageFiles = files['images'] ?? [];
    const logoFiles = files['logo'] ?? [];

    // Validate uploaded images
    const validation = await FileValidationService.validateMulterFiles(imageFiles);
    if (!validation.valid) {
      res.status(400).json({
        message: 'Image validation failed',
        errors: validation.invalidFiles,
      });
      return;
    }

    // Validate logo if present
    if (logoFiles.length > 0) {
      const logoValidation = await FileValidationService.validateMulterFile(logoFiles[0]);
      if (!logoValidation.valid) {
        res.status(400).json({
          message: 'Logo validation failed',
          error: logoValidation.error,
        });
        return;
      }
    }

    // Save validated files to disk
    const filenames = await Promise.all(
      imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname, 'business'))
    );
    const newImagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };

    // `existingImages` (a JSON-stringified string[], sent separately from
    // the `images` file field) carries the gallery URLs the admin chose to
    // KEEP — i.e. didn't remove — on this edit. Without it, uploading new
    // photos would silently wipe out every existing one instead of adding
    // to them. Only rebuild `images` when the gallery was actually touched
    // (a kept-list was sent, or new files were uploaded); otherwise leave
    // it out of the DTO so the service's `data.images !== undefined` check
    // skips the column entirely and the existing gallery is left alone.
    const existingImagesRaw = rawBody['existingImages'];
    delete rawBody['existingImages'];
    let keptImages: string[] = [];
    let existingImagesProvided = false;
    if (typeof existingImagesRaw === 'string') {
      existingImagesProvided = true;
      try {
        const parsed = JSON.parse(existingImagesRaw);
        if (Array.isArray(parsed)) keptImages = parsed.filter((v): v is string => typeof v === 'string');
      } catch { /* malformed — treat as no photos kept */ }
    }
    if (existingImagesProvided || newImagePaths.length > 0) {
      rawBody['images'] = [...keptImages, ...newImagePaths];
    }

    // Save logo if present
    if (logoFiles.length > 0) {
      const logoFilename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname, 'business');
      rawBody['logo'] = `/uploads/${logoFilename}`;
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
