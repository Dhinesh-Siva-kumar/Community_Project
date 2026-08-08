import { Request, Response, NextFunction } from 'express';
import { CreateReportDto } from './reports.dto';
import * as reportsService from './reports.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = CreateReportDto.parse(req.body);
    const report = await reportsService.createReport(req.user!.sub, dto);
    res.status(201).json(report);
  } catch (err) { next(err); }
}

export async function getPendingCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await reportsService.countPending();
    res.json(result);
  } catch (err) { next(err); }
}
