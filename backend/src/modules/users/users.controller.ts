import { Request, Response, NextFunction } from 'express';
import { UpdateUserDto, ListUsersQueryDto } from './users.dto';
import * as usersService from './users.service';

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const result = await usersService.getProfile(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const rawBody = { ...req.body };
    if (req.file) rawBody['avatar'] = `/uploads/profiles/${req.file.filename}`;
    const body = UpdateUserDto.parse(rawBody);
    const result = await usersService.updateProfile(userId, body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, search } = ListUsersQueryDto.parse(req.query);
    const result = await usersService.getUsers(page, limit, search);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const result = await usersService.getDashboardStats(userId, role);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const result = await usersService.blockUser(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function unblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const result = await usersService.unblockUser(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function trustUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const result = await usersService.trustUser(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function untrustUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params['id'] as string;
    const result = await usersService.untrustUser(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
