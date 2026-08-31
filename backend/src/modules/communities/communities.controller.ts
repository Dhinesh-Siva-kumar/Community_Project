import { Request, Response, NextFunction } from 'express';
import { CreateCommunityDto, UpdateCommunityDto, ListCommunitiesQueryDto, PaginationQueryDto, ListPendingCommunitiesQueryDto, RejectCommunityDto, RequestMoreInfoCommunityDto, SuggestedCommunitiesQueryDto } from './communities.dto';
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

export async function getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const skipActiveFilter = req.user!.role === 'ADMIN';
    const result = await communitiesService.getAnalytics({ skipActiveFilter, userId: req.user!.sub });
    res.json(result);
  } catch (err) { next(err); }
}

export async function getSuggested(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit } = SuggestedCommunitiesQueryDto.parse(req.query);
    const result = await communitiesService.getSuggested(req.user!.sub, limit);
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
    const result = await communitiesService.update(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteCommunity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.deleteCommunity(req.params['id'] as string, req.user!.sub);
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

export async function getMyCreatedCommunities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListCommunitiesQueryDto.parse(req.query);
    const result = await communitiesService.findAll({
      ...query,
      createdById: req.user!.sub,
      skipActiveFilter: true,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findPending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListPendingCommunitiesQueryDto.parse(req.query);
    const result = await communitiesService.findPendingOnly(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getPendingCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.countPending();
    res.json(result);
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await communitiesService.approve(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RejectCommunityDto.parse(req.body ?? {});
    const result = await communitiesService.reject(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function requestMoreInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RequestMoreInfoCommunityDto.parse(req.body ?? {});
    const result = await communitiesService.requestMoreInfo(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}
