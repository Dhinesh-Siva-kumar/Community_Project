import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import db from '../config/db';

// Throttled "last active" touch — updated at most once every 5 minutes per
// user so every authenticated request doesn't turn into a write. Fire-and-
// forget: never blocks or fails the request it rides along with.
function touchLastActive(userId: string): void {
  db('users')
    .where({ id: userId })
    .andWhere(function () {
      this.whereNull('last_active_at').orWhereRaw("last_active_at < NOW() - INTERVAL '5 minutes'");
    })
    .update({ last_active_at: db.fn.now() })
    .catch(() => { /* best-effort only */ });
}

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
    touchLastActive(decoded.sub);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AppError(401, 'Token expired', 'TOKEN_EXPIRED'));
    } else {
      next(new AppError(401, 'Invalid token'));
    }
  }
}
