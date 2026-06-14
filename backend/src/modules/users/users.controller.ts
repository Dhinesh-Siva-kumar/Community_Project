import { Request, Response, NextFunction } from 'express';
import {
  UpdateUserDto, ListUsersQueryDto,
  AdminCreateUserDto, AdminChangeRoleDto, AdminResetPasswordDto,
  AuditLogQueryDto, BroadcastNotificationDto,
} from './users.dto';
import * as usersService from './users.service';

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.getProfile(req.user!.sub)); } catch (e) { next(e); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawBody = { ...req.body };
    if (req.file) rawBody['avatar'] = `/uploads/profiles/${req.file.filename}`;
    res.json(await usersService.updateProfile(req.user!.sub, UpdateUserDto.parse(rawBody)));
  } catch (e) { next(e); }
}

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, search, role, status, joined } = ListUsersQueryDto.parse(req.query);
    res.json(await usersService.getUsers(page, limit, search, role, status, joined));
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

export async function changeUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = AdminChangeRoleDto.parse(req.body);
    res.json(await usersService.changeUserRole(req.user!.sub, req.params['id'] as string, dto));
  } catch (e) { next(e); }
}

export async function adminResetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = AdminResetPasswordDto.parse(req.body);
    res.json(await usersService.adminResetPassword(req.user!.sub, req.params['id'] as string, dto));
  } catch (e) { next(e); }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, action } = AuditLogQueryDto.parse(req.query);
    res.json(await usersService.getAuditLogs(page, limit, action));
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
  try { res.json(await usersService.trustUser(req.params['id'] as string)); } catch (e) { next(e); }
}

export async function untrustUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await usersService.untrustUser(req.params['id'] as string)); } catch (e) { next(e); }
}
