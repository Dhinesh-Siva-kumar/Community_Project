import { Request, Response, NextFunction } from 'express';
import { AuditLogQueryDto } from './audit.dto';
import * as auditService from './audit.service';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = AuditLogQueryDto.parse(req.query);
    res.json(await auditService.getAuditLogs(query));
  } catch (e) { next(e); }
}

export async function getFacets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await auditService.getFacets()); } catch (e) { next(e); }
}
