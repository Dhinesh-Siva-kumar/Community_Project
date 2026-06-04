import { Request, Response, NextFunction } from 'express';
import { CreateCommunityDto, UpdateCommunityDto, ListCommunitiesQueryDto, PaginationQueryDto } from './communities.dto';
import * as communitiesService from './communities.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateCommunityDto.parse(req.body);
    const result = await communitiesService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListCommunitiesQueryDto.parse(req.query);
    const result = await communitiesService.findAll(query);
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
