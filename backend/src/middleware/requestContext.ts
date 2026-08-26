import { Request, Response, NextFunction } from 'express';
import { parseAcceptLanguage, runWithRequestContext } from '../services/request-context';

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  runWithRequestContext(
    {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      lang: parseAcceptLanguage(req.headers['accept-language']),
    },
    next,
  );
}
