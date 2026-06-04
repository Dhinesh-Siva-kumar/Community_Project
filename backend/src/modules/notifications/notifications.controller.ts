import { Request, Response, NextFunction } from 'express';
import { PaginationQueryDto } from './notifications.dto';
import * as notificationsService from './notifications.service';

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = PaginationQueryDto.parse(req.query);
    const result = await notificationsService.findAll(req.user!.sub, page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await notificationsService.markAsRead(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await notificationsService.markAllAsRead(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await notificationsService.getUnreadCount(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
