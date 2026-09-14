import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { JwtPayload } from './authenticate';

/**
 * Same JWT check as `authenticate`, but never rejects the request — a
 * missing, malformed, or expired token just leaves `req.user` unset instead
 * of 401ing. Lets a route serve both guests and logged-in users, each seeing
 * a different (service-layer-decided) slice of the data.
 */
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
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
  } catch {
    // Invalid/expired token on an optionally-authenticated route — treat the
    // caller as a guest rather than failing the request.
  }

  next();
}
