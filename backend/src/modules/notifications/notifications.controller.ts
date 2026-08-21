import { Request, Response, NextFunction } from 'express';
import { PaginationQueryDto, UpdatePreferencesDto } from './notifications.dto';
import * as notificationsService from './notifications.service';
import type { NotificationType } from './notifications.service';

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

export async function getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await notificationsService.getPreferences(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = UpdatePreferencesDto.parse(req.body);
    const result = await notificationsService.updatePreferences(req.user!.sub, {
      mutedTypes: dto.mutedTypes as NotificationType[] | undefined,
      emailDigestEnabled: dto.emailDigestEnabled,
    });
    res.json(result);
  } catch (err) { next(err); }
}
