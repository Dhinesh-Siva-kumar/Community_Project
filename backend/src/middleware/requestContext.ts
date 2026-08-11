import { Request, Response, NextFunction } from 'express';
import { runWithRequestContext } from '../services/request-context';

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  runWithRequestContext(
    { ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null },
    next,
  );
}
