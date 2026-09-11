import { Request, Response, NextFunction } from 'express';
import {
  CreateEventDto, UpdateEventDto, EventFieldsShape, ListEventsQueryDto, ListPendingEventsQueryDto, RejectEventDto, RequestMoreInfoEventDto,
  CreateEventCategoryDto, UpdateEventCategoryDto,
} from './events.dto';
import * as eventsService from './events.service';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile } from '../../services/upload-storage.service';

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateEventCategoryDto.parse(req.body);
    const result = await eventsService.createEventCategory(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventsService.getEventCategories(req.query['activeOnly'] === 'true');
    res.json(result);
  } catch (err) { next(err); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = UpdateEventCategoryDto.parse(req.body);
    const result = await eventsService.updateEventCategory(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

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
    const expectedFields = Object.keys(EventFieldsShape.shape);
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
    const skipActiveFilter = req.user!.role === 'ADMIN';
    const result = await eventsService.findAll({ ...query, skipActiveFilter, viewerId: req.user!.sub });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListEventsQueryDto.parse(req.query);
    const result = await eventsService.findAll({ ...query, userId: req.user!.sub, skipActiveFilter: true });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findPending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListPendingEventsQueryDto.parse(req.query);
    const result = await eventsService.findPendingOnly(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getPendingCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventsService.countPending();
    res.json(result);
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventsService.approve(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RejectEventDto.parse(req.body ?? {});
    const result = await eventsService.reject(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function requestMoreInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RequestMoreInfoEventDto.parse(req.body ?? {});
    const result = await eventsService.requestMoreInfo(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await eventsService.findOne(req.params['id'] as string, req.user!.sub, req.user!.role);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findRelated(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limitParam = Number(req.query['limit']);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : undefined;
    const result = await eventsService.findRelated(req.params['id'] as string, req.user!.sub, limit);
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
    const expectedFields = Object.keys(EventFieldsShape.shape);
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
