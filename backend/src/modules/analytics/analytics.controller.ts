import { Request, Response, NextFunction } from 'express';
import { AnalyticsOverviewQueryDto } from './analytics.dto';
import * as analyticsService from './analytics.service';

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = AnalyticsOverviewQueryDto.parse(req.query);
    res.json(await analyticsService.getOverview(query));
  } catch (e) { next(e); }
}
