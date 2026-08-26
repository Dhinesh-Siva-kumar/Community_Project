import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'Unauthorized', 'UNAUTHORIZED'));
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new AppError(403, 'Forbidden: insufficient role', 'FORBIDDEN_INSUFFICIENT_ROLE'));
    }
    next();
  };
}
