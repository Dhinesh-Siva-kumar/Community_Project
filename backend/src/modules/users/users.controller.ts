import { Request, Response, NextFunction } from 'express';
import {
  UpdateUserDto, ListUsersQueryDto,
  AdminCreateUserDto, AdminResetPasswordDto,
  AuditLogQueryDto, BroadcastNotificationDto, ChartDataQueryDto,
} from './users.dto';
import * as usersService from './users.service';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile } from '../../services/upload-storage.service';

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.getProfile(req.user!.sub)); } catch (e) { next(e); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawBody = { ...req.body };

    // Validate avatar file if present, then write the validated buffer to
    // disk ourselves — uploadProfile uses memory storage, so nothing is
    // saved until validation passes (same pattern as business/events/jobs).
    if (req.file) {
      const validation = await FileValidationService.validateMulterFile(req.file);
      if (!validation.valid) {
        res.status(400).json({
          message: 'Avatar validation failed',
          error: validation.error,
        });
        return;
      }
      const filename = await saveBufferToFile(req.file.buffer, req.file.originalname, 'profiles');
      rawBody['avatar'] = `/uploads/${filename}`;
    }

    res.json(await usersService.updateProfile(req.user!.sub, UpdateUserDto.parse(rawBody)));
  } catch (e) { next(e); }
}

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListUsersQueryDto.parse(req.query);
    res.json(await usersService.getUsers(query));
  } catch (e) { next(e); }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.getDashboardStats(req.user!.sub, req.user!.role)); } catch (e) { next(e); }
}

export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.getUserById(req.params['id'] as string)); } catch (e) { next(e); }
}

export async function adminCreateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = AdminCreateUserDto.parse(req.body);
    res.status(201).json(await usersService.adminCreateUser(req.user!.sub, dto));
  } catch (e) { next(e); }
}

export async function softDeleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.softDeleteUser(req.user!.sub, req.params['id'] as string)); } catch (e) { next(e); }
}

export async function adminResetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = AdminResetPasswordDto.parse(req.body);
    res.json(await usersService.adminResetPassword(req.user!.sub, req.params['id'] as string, dto));
  } catch (e) { next(e); }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, action, userId } = AuditLogQueryDto.parse(req.query);
    res.json(await usersService.getAuditLogs(page, limit, action, userId));
  } catch (e) { next(e); }
}

export async function broadcastNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = BroadcastNotificationDto.parse(req.body);
    res.json(await usersService.broadcastNotification(req.user!.sub, dto));
  } catch (e) { next(e); }
}

export async function blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.blockUser(req.params['id'] as string, req.user!.sub)); } catch (e) { next(e); }
}

export async function unblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.unblockUser(req.params['id'] as string, req.user!.sub)); } catch (e) { next(e); }
}

export async function trustUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.trustUser(req.params['id'] as string, req.user!.sub)); } catch (e) { next(e); }
}

export async function untrustUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.untrustUser(req.params['id'] as string, req.user!.sub)); } catch (e) { next(e); }
}

export async function getCharts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = ChartDataQueryDto.parse(req.query);
    res.json(await usersService.getChartData(from, to));
  } catch (e) { next(e); }
}