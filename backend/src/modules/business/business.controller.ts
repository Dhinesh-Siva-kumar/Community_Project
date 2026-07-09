import { Request, Response, NextFunction } from 'express';
import { CreateBusinessDto, UpdateBusinessDto, CreateBusinessCategoryDto, UpdateBusinessCategoryDto, ListBusinessQueryDto } from './business.dto';
import * as businessService from './business.service';
import { FileValidationService } from '../../services/file-validation.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';

// Helper to save buffer to disk
async function saveBufferToFile(buffer: Buffer, originalName: string): Promise<string> {
  const uploadsBase = path.resolve(env.UPLOADS_PATH);
  const ext = path.extname(originalName);
  const filename = uuidv4() + ext;
  const filePath = path.join(uploadsBase, filename);
  
  if (!fs.existsSync(uploadsBase)) {
    fs.mkdirSync(uploadsBase, { recursive: true });
  }
  
  fs.writeFileSync(filePath, buffer);
  return filename;
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateBusinessCategoryDto.parse(req.body);
    const result = await businessService.createCategory(body);
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
    const result = await businessService.updateCategory(req.params['id'] as string, body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.deleteCategory(req.params['id'] as string);
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
      imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;

    // Save logo if present
    if (logoFiles.length > 0) {
      const logoFilename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname);
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
    const result = await businessService.findAll(query);
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
      imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;

    // Save logo if present
    if (logoFiles.length > 0) {
      const logoFilename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname);
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
