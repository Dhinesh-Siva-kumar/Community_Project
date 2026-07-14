import { Request, Response, NextFunction } from 'express';
import { CreateJobDto, UpdateJobDto, ListJobsQueryDto } from './jobs.dto';
import * as jobsService from './jobs.service';
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

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) ?? {};
    const logoFiles = files['logo'] ?? [];
    const imageFiles = files['images'] ?? [];

    // Validate logo file if present
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

    // Validate gallery images if present
    if (imageFiles.length > 0) {
      const imagesValidation = await FileValidationService.validateMulterFiles(imageFiles);
      if (!imagesValidation.valid) {
        res.status(400).json({
          message: 'Image validation failed',
          errors: imagesValidation.invalidFiles,
        });
        return;
      }
    }

    const rawBody = { ...req.body };

    // Save and extract company logo (single file under 'logo' field)
    if (logoFiles.length) {
      const logoFilename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname);
      rawBody['companyLogo'] = `/uploads/${logoFilename}`;
    }

    // Save and extract job gallery images (multiple files under 'images' field)
    if (imageFiles.length) {
      const imageFilenames = await Promise.all(
        imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname))
      );
      rawBody['images'] = imageFilenames.map((f) => `/uploads/${f}`);
    }

    const body = CreateJobDto.parse(rawBody);
    const result = await jobsService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListJobsQueryDto.parse(req.query);
    const result = await jobsService.findAll(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await jobsService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) ?? {};
    const logoFiles = files['logo'] ?? [];
    const imageFiles = files['images'] ?? [];

    // Validate logo file if present
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

    // Validate gallery images if present
    if (imageFiles.length > 0) {
      const imagesValidation = await FileValidationService.validateMulterFiles(imageFiles);
      if (!imagesValidation.valid) {
        res.status(400).json({
          message: 'Image validation failed',
          errors: imagesValidation.invalidFiles,
        });
        return;
      }
    }

    const rawBody = { ...req.body };

    // Save and extract company logo if provided
    if (logoFiles.length) {
      const logoFilename = await saveBufferToFile(logoFiles[0].buffer, logoFiles[0].originalname);
      rawBody['companyLogo'] = `/uploads/${logoFilename}`;
    }

    // Save and extract gallery images if provided
    if (imageFiles.length) {
      const imageFilenames = await Promise.all(
        imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname))
      );
      rawBody['images'] = imageFilenames.map((f) => `/uploads/${f}`);
    }

    const body = UpdateJobDto.parse(rawBody);
    const result = await jobsService.update(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await jobsService.deleteJob(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
