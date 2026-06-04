import { Request, Response, NextFunction } from 'express';
import { CreateEventDto, UpdateEventDto, ListEventsQueryDto } from './events.dto';
import * as eventsService from './events.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const rawBody = { ...req.body };
    if (files.length) rawBody['images'] = files.map((f) => `/uploads/${f.filename}`);
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
    const rawBody = { ...req.body };
    if (files.length) rawBody['images'] = files.map((f) => `/uploads/${f.filename}`);
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
