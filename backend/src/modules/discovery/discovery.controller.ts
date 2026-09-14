import { Request, Response, NextFunction } from 'express';
import { DiscoveryPreviewQueryDto, DiscoverySearchQueryDto } from './discovery.dto';
import * as discoveryService from './discovery.service';

export async function jobsPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { countryId, limit } = DiscoveryPreviewQueryDto.parse(req.query);
    const data = await discoveryService.getJobsPreview(countryId, limit);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function businessesPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { countryId, limit } = DiscoveryPreviewQueryDto.parse(req.query);
    const data = await discoveryService.getBusinessesPreview(countryId, limit);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function eventsPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { countryId, limit } = DiscoveryPreviewQueryDto.parse(req.query);
    const data = await discoveryService.getEventsPreview(countryId, limit);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function communitiesPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { countryId, limit } = DiscoveryPreviewQueryDto.parse(req.query);
    const data = await discoveryService.getCommunitiesPreview(countryId, limit);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function postsPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { countryId, limit } = DiscoveryPreviewQueryDto.parse(req.query);
    const data = await discoveryService.getPostsPreview(countryId, limit);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function stats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await discoveryService.getPlatformStats();
    res.json({ data });
  } catch (err) { next(err); }
}

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q, countryId, limit } = DiscoverySearchQueryDto.parse(req.query);
    const results = await discoveryService.searchAll(q, countryId, limit);
    res.json({ success: true, ...results });
  } catch (err) { next(err); }
}
