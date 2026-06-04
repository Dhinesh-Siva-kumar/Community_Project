import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';

export interface JwtPayload {
  sub: string;
  userName: string;
  role: string;
  roleLevel: number;
  iat?: number;
  exp?: number;
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authorization header missing or malformed'));
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      sub: decoded.sub,
      userName: decoded.userName,
      role: decoded.role,
      roleLevel: decoded.roleLevel,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AppError(401, 'Token expired', 'TOKEN_EXPIRED'));
    } else {
      next(new AppError(401, 'Invalid token'));
    }
  }
}
