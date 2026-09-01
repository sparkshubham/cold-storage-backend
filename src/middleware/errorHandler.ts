import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: err.flatten(),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors ?? undefined,
    });
  }

  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
  if (name === 'CastError' || name === 'BSONError') {
    return res.status(400).json({ success: false, message: 'Invalid id' });
  }

  logger.error({ err }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    message: isProduction ? 'Internal server error' : err instanceof Error ? err.message : 'Internal server error',
  });
}
