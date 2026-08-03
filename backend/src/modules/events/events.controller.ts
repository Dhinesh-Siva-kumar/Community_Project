import { Request, Response, NextFunction } from 'express';
import { CreateEventDto, UpdateEventDto, ListEventsQueryDto } from './events.dto';
import * as eventsService from './events.service';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile } from '../../services/upload-storage.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Validate uploaded images
    const validation = await FileValidationService.validateMulterFiles(files);
    if (!validation.valid) {
      res.status(400).json({
        message: 'Image validation failed',
        errors: validation.invalidFiles,
      });
      return;
    }

    // Save validated files to disk
    const filenames = await Promise.all(
      files.map((f) => saveBufferToFile(f.buffer, f.originalname, 'events'))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;
    
    // Ensure all fields from DTO are present in rawBody before parsing
    const expectedFields = Object.keys(CreateEventDto.shape);
    expectedFields.forEach(field => {
      if (!(field in rawBody)) {
        // Assign a default or empty value if missing, Zod will validate required fields
        rawBody[field] = undefined; 
      }
    });

    const body = CreateEventDto.parse(rawBody);
    const result = await eventsService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListEventsQueryDto.parse(req.query);
    const result = await eventsService.findAll(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventsService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Validate uploaded images
    const validation = await FileValidationService.validateMulterFiles(files);
    if (!validation.valid) {
      res.status(400).json({
        message: 'Image validation failed',
        errors: validation.invalidFiles,
      });
      return;
    }

    // Save validated files to disk
    const filenames = await Promise.all(
      files.map((f) => saveBufferToFile(f.buffer, f.originalname, 'events'))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;
    
    // Ensure all fields from DTO are present in rawBody before parsing
    const expectedFields = Object.keys(UpdateEventDto.shape);
    expectedFields.forEach(field => {
      if (!(field in rawBody)) {
        // Assign a default or empty value if missing, Zod will validate required fields
        rawBody[field] = undefined; 
      }
    });

    const body = UpdateEventDto.parse(rawBody);
    const result = await eventsService.update(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventsService.deleteEvent(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
