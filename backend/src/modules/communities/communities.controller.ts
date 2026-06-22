import { Request, Response, NextFunction } from 'express';
import { CreateCommunityDto, UpdateCommunityDto, ListCommunitiesQueryDto, PaginationQueryDto } from './communities.dto';
import * as communitiesService from './communities.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = CreateCommunityDto.safeParse(req.body);
    if (!parsed.success) {
      // Collect the first message per field path; path [] becomes 'general'.
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join('_') : 'general';
        if (!errors[key]) errors[key] = issue.message;
      }
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const result = await communitiesService.create(parsed.data, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListCommunitiesQueryDto.parse(req.query);
    const skipActiveFilter = req.user!.role === 'ADMIN';
    const result = await communitiesService.findAll({
      ...query,
      skipActiveFilter,
      userId: req.user!.sub,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = UpdateCommunityDto.parse(req.body);
    const result = await communitiesService.update(req.params['id'] as string, body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteCommunity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.deleteCommunity(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function join(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.join(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.leave(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = PaginationQueryDto.parse(req.query);
    const result = await communitiesService.getMembers(req.params['id'] as string, page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getMyCommunities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.getMyCommunities(req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}