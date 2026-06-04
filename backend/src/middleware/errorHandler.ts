import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = uuidv4();
  res.setHeader('X-Request-ID', requestId);

  if (err instanceof ZodError) {
    res.status(400).json({
      statusCode: 400,
      error: 'Validation Error',
      fields: err.flatten().fieldErrors,
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      statusCode: err.statusCode,
      message: err.message,
      requestId,
    };
    if (err.code) body['code'] = err.code;
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof MulterError) {
    res.status(400).json({
      statusCode: 400,
      error: 'File Upload Error',
      message: err.message,
      requestId,
    });
    return;
  }

  const isDev = env.NODE_ENV === 'development';
  const stack = isDev && err instanceof Error ? err.stack : undefined;

  if (isDev && err instanceof Error) {
    console.error('[ERROR]', err.stack);
  } else {
    console.error('[ERROR]', err);
  }

  res.status(500).json({
    statusCode: 500,
    message: 'Internal server error',
    ...(stack ? { stack } : {}),
    requestId,
  });
}
